import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const STAGES = [
  {
    name: "intent_extraction",
    order: 1,
    system: `You are an intent extractor for an app compiler. Parse the user's product description into structured JSON only. No prose. Output exactly this shape:
{
  "app_name": string,
  "app_type": string,
  "core_features": string[],
  "user_roles": string[],
  "data_entities": string[],
  "auth_required": boolean,
  "payment_required": boolean,
  "admin_panel": boolean,
  "ambiguities": string[],
  "assumptions": string[]
}`,
  },
  {
    name: "system_design",
    order: 2,
    system: `You are a system architect. Given structured intent JSON, output a system design in JSON only. No prose. Output exactly this shape:
{
  "pages": [{ "name": string, "route": string, "access": string[], "components": string[] }],
  "entities": [{ "name": string, "fields": [{ "name": string, "type": string, "required": boolean }], "relations": string[] }],
  "api_endpoints": [{ "method": string, "path": string, "auth": string[], "body": object, "response": object }],
  "user_roles": [{ "role": string, "permissions": string[] }],
  "flows": [{ "name": string, "steps": string[] }]
}`,
  },
  {
    name: "schema_generation",
    order: 3,
    system: `You are a schema compiler. Given system design JSON, output a complete schema in JSON only. No prose. Output exactly this shape:
{
  "ui_schema": {
    "pages": [{ "name": string, "route": string, "layout": string, "components": [{ "type": string, "props": object, "api_binding": string }] }]
  },
  "api_schema": {
    "endpoints": [{ "method": string, "path": string, "middleware": string[], "validation": object, "response_shape": object }]
  },
  "db_schema": {
    "tables": [{ "name": string, "columns": [{ "name": string, "type": string, "constraints": string[] }], "indexes": string[], "rls_policies": string[] }]
  },
  "auth_schema": {
    "provider": string,
    "roles": [{ "role": string, "permissions": string[] }],
    "guards": [{ "route": string, "required_role": string }]
  }
}`,
  },
  {
    name: "refinement",
    order: 4,
    system: `You are a schema validator and refiner. Given the complete schema JSON, check for all of these issues and fix them:
1. API fields that don't match DB columns
2. UI components that reference non-existent API endpoints
3. Auth guards for routes that don't exist
4. Missing required fields
5. Type mismatches

Output exactly this shape (JSON only, no prose):
{
  "is_valid": boolean,
  "issues_found": [{ "type": string, "description": string, "location": string }],
  "fixes_applied": [{ "type": string, "description": string }],
  "repaired_schema": { ...same shape as the input schema... },
  "business_logic": [{ "rule": string, "implementation": string }],
  "execution_notes": string[]
}`,
  },
];

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim();
}

// Sleep utility for rate limiting
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGroq(system: string, userMessage: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4096,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage }
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { projectId, prompt, retryFromStage } = await req.json();
    if (!projectId || !prompt) {
      return new Response(JSON.stringify({ error: "projectId and prompt required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check idempotency (only for fresh runs, not retries)
    const { data: existingStages } = await supabase
      .from("pipeline_stages")
      .select("id, status, stage_name, output_data")
      .eq("project_id", projectId);

    if (!retryFromStage && existingStages && existingStages.length > 0) {
      const allDone = existingStages.every((s: any) => s.status === "completed");
      if (allDone) {
        return new Response(JSON.stringify({ message: "Pipeline already completed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update project status
    await supabase.from("projects").update({ status: "processing" }).eq("id", projectId);

    // Determine which stages to run
    let stagesToRun = STAGES;
    let previousOutput: any = prompt;
    let stageRowMap: Map<string, any> = new Map();

    if (retryFromStage) {
      // Find the starting stage index
      const startIndex = STAGES.findIndex((s) => s.name === retryFromStage);
      if (startIndex === -1) {
        return new Response(JSON.stringify({ error: `Invalid stage name: ${retryFromStage}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      stagesToRun = STAGES.slice(startIndex);

      // Load previous stage outputs from DB
      for (let i = 0; i < startIndex; i++) {
        const prevStage = STAGES[i];
        const existingRow = existingStages?.find((s: any) => s.stage_name === prevStage.name);
        if (existingRow?.status === "completed") {
          previousOutput = existingRow.output_data;
        }
      }

      // Reset the retry stage and subsequent stages to pending
      for (const stage of stagesToRun) {
        const existingRow = existingStages?.find((s: any) => s.stage_name === stage.name);
        if (existingRow) {
          await supabase
            .from("pipeline_stages")
            .update({
              status: "pending",
              output_data: null,
              error_message: null,
              latency_ms: null,
              retries: 0,
              completed_at: null,
            })
            .eq("id", existingRow.id);
        }
      }
    } else {
      // Fresh run - create stage rows if they don't exist
      if (!existingStages || existingStages.length === 0) {
        const stageRows = STAGES.map((s) => ({
          project_id: projectId,
          stage_name: s.name,
          stage_order: s.order,
          status: "pending",
        }));

        const { data: insertedStages, error: insertErr } = await supabase
          .from("pipeline_stages")
          .insert(stageRows)
          .select();

        if (insertErr) throw insertErr;
        
        for (const row of insertedStages || []) {
          stageRowMap.set(row.stage_name, row);
        }
      } else {
        for (const row of existingStages) {
          stageRowMap.set(row.stage_name, row);
        }
      }
    }

    let allSucceeded = true;

    for (const stage of stagesToRun) {
      // Delay to avoid rate limiting
      await sleep(3000);
      
      let stageRow = stageRowMap.get(stage.name);
      
      // Get or create stage row
      if (!stageRow) {
        const { data: newRow, error: createErr } = await supabase
          .from("pipeline_stages")
          .insert({
            project_id: projectId,
            stage_name: stage.name,
            stage_order: stage.order,
            status: "pending",
          })
          .select()
          .single();
        
        if (createErr) throw createErr;
        stageRow = newRow;
      }

      // Mark running
      await supabase
        .from("pipeline_stages")
        .update({ status: "running", input_data: typeof previousOutput === "string" ? { prompt: previousOutput } : previousOutput })
        .eq("id", stageRow.id);

      const startTime = Date.now();
      let retries = 0;
      let parsed: any = null;
      let errorMsg: string | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const userMsg = attempt === 0
            ? (typeof previousOutput === "string" ? previousOutput : JSON.stringify(previousOutput))
            : "Your previous output was invalid JSON. Return valid JSON only, no markdown, no backticks, no prose.\n\n" +
              (typeof previousOutput === "string" ? previousOutput : JSON.stringify(previousOutput));

          const rawResponse = await callGroq(stage.system, userMsg);
          const cleaned = stripCodeFences(rawResponse);
          parsed = JSON.parse(cleaned);
          errorMsg = null;
          break;
        } catch (e: any) {
          errorMsg = e.message;
          retries = attempt + 1;
        }
      }

      const latency = Date.now() - startTime;

      if (parsed) {
        await supabase
          .from("pipeline_stages")
          .update({
            status: "completed",
            output_data: parsed,
            latency_ms: latency,
            retries: retries > 0 ? retries - 1 : 0,
            completed_at: new Date().toISOString(),
          })
          .eq("id", stageRow.id);

        previousOutput = parsed;
      } else {
        await supabase
          .from("pipeline_stages")
          .update({
            status: "failed",
            error_message: errorMsg,
            latency_ms: latency,
            retries: 1,
          })
          .eq("id", stageRow.id);

        // Update project status to failed
        await supabase.from("projects").update({ status: "failed" }).eq("id", projectId);

        return new Response(JSON.stringify({ error: `Stage ${stage.name} failed: ${errorMsg}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Write final schema
    if (allSucceeded && previousOutput) {
      const refinementOutput = previousOutput as any;
      const schema = refinementOutput.repaired_schema || refinementOutput;

      await supabase.from("final_schemas").insert({
        project_id: projectId,
        ui_schema: schema.ui_schema || null,
        api_schema: schema.api_schema || null,
        db_schema: schema.db_schema || null,
        auth_schema: schema.auth_schema || null,
        business_logic: refinementOutput.business_logic || null,
        validation_report: {
          is_valid: refinementOutput.is_valid,
          issues_found: refinementOutput.issues_found,
          fixes_applied: refinementOutput.fixes_applied,
          execution_notes: refinementOutput.execution_notes,
        },
        assumptions: (await supabase
          .from("pipeline_stages")
          .select("output_data")
          .eq("project_id", projectId)
          .eq("stage_name", "intent_extraction")
          .single()
        ).data?.output_data?.assumptions || [],
        is_valid: refinementOutput.is_valid ?? false,
      });

      // Create evaluation run
      const { data: allStages } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("project_id", projectId);

      const totalLatency = (allStages || []).reduce((s: number, st: any) => s + (st.latency_ms || 0), 0);
      const totalRetries = (allStages || []).reduce((s: number, st: any) => s + (st.retries || 0), 0);

      await supabase.from("evaluation_runs").insert({
        project_id: projectId,
        success_rate: 1.0,
        total_retries: totalRetries,
        total_latency_ms: totalLatency,
        stage_latencies: (allStages || []).reduce((acc: any, st: any) => {
          acc[st.stage_name] = st.latency_ms;
          return acc;
        }, {}),
      });
    }

    await supabase
      .from("projects")
      .update({ status: allSucceeded ? "completed" : "failed" })
      .eq("id", projectId);

    return new Response(JSON.stringify({ success: allSucceeded }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});