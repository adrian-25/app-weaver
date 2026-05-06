import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { StageCard } from '@/components/StageCard';
import { JsonViewer } from '@/components/JsonViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Download, AlertTriangle, CheckCircle2, Clock, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'processing' || status === 'pending' ? 2000 : false;
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ['stages', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('project_id', id!)
        .order('stage_order');
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      const hasRunning = query.state.data?.some((s: any) => s.status === 'running' || s.status === 'pending');
      return hasRunning ? 2000 : false;
    },
  });

  const { data: finalSchema } = useQuery({
    queryKey: ['final_schema', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('final_schemas')
        .select('*')
        .eq('project_id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      return !query.state.data && project?.status === 'processing' ? 3000 : false;
    },
  });

  const allDone = stages.length > 0 && stages.every((s) => s.status === 'completed');
  const totalLatency = stages.reduce((sum, s) => sum + (s.latency_ms ?? 0), 0);
  const totalRetries = stages.reduce((sum, s) => sum + (s.retries ?? 0), 0);
  const completedCount = stages.filter((s) => s.status === 'completed').length;

  const intentOutput = stages.find((s) => s.stage_name === 'intent_extraction')?.output_data as Record<string, any> | null;
  const assumptions = intentOutput?.assumptions as string[] | undefined;
  const ambiguities = intentOutput?.ambiguities as string[] | undefined;

  const copySchema = () => {
    if (finalSchema) {
      navigator.clipboard.writeText(JSON.stringify(finalSchema, null, 2));
      toast.success('Schema copied to clipboard');
    }
  };

  const downloadSchema = () => {
    if (finalSchema) {
      const blob = new Blob([JSON.stringify(finalSchema, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project?.title || 'schema'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="container py-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-heading font-bold text-lg truncate">{project?.title}</h2>
            <Badge variant={project?.status === 'completed' ? 'default' : 'secondary'}>
              {project?.status}
            </Badge>
            <p className="text-xs text-muted-foreground line-clamp-4">{project?.original_prompt}</p>
          </div>

          {/* Metrics */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-heading font-semibold text-sm">Metrics</h3>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-lg bg-secondary/50 p-3">
                <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold font-heading">{(totalLatency / 1000).toFixed(1)}s</p>
                <p className="text-[10px] text-muted-foreground">Total Latency</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3">
                <Layers className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold font-heading">{completedCount}/{stages.length}</p>
                <p className="text-[10px] text-muted-foreground">Stages</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3">
                <p className="text-lg font-bold font-heading">{totalRetries}</p>
                <p className="text-[10px] text-muted-foreground">Retries</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3">
                {finalSchema?.is_valid ? (
                  <CheckCircle2 className="h-5 w-5 mx-auto text-success" />
                ) : (
                  <AlertTriangle className="h-5 w-5 mx-auto text-warning" />
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {finalSchema?.is_valid ? 'Valid ✓' : allDone ? 'Issues ✗' : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="lg:col-span-3 space-y-6">
          {ambiguities && ambiguities.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-lg border border-warning/30 bg-warning/10 p-4 flex items-start gap-3"
            >
              <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-warning">Assumptions were made</p>
                <p className="text-xs text-muted-foreground mt-1">Review the assumptions below for accuracy.</p>
              </div>
            </motion.div>
          )}

          {project?.status === 'failed' && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Pipeline timed out or failed — partial results shown below.
            </div>
          )}

          <div className="space-y-4">
            {stages.map((stage, i) => (
              <StageCard key={stage.id} stage={stage} index={i} />
            ))}
            {stages.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                Waiting for pipeline to start...
              </div>
            )}
          </div>

          {allDone && finalSchema && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-heading font-bold text-xl">Generated Schema</h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copySchema}>
                    <Copy className="mr-1.5 h-3 w-3" /> Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadSchema}>
                    <Download className="mr-1.5 h-3 w-3" /> Export JSON
                  </Button>
                </div>
              </div>

              <Tabs defaultValue="ui">
                <TabsList className="bg-secondary">
                  <TabsTrigger value="ui">UI Schema</TabsTrigger>
                  <TabsTrigger value="api">API Schema</TabsTrigger>
                  <TabsTrigger value="db">DB Schema</TabsTrigger>
                  <TabsTrigger value="auth">Auth Schema</TabsTrigger>
                </TabsList>
                <TabsContent value="ui"><JsonViewer data={finalSchema.ui_schema} /></TabsContent>
                <TabsContent value="api"><JsonViewer data={finalSchema.api_schema} /></TabsContent>
                <TabsContent value="db"><JsonViewer data={finalSchema.db_schema} /></TabsContent>
                <TabsContent value="auth"><JsonViewer data={finalSchema.auth_schema} /></TabsContent>
              </Tabs>

              {finalSchema.validation_report && (
                <JsonViewer data={finalSchema.validation_report} title="Validation Report" collapsed />
              )}

              {assumptions && assumptions.length > 0 && (
                <JsonViewer data={assumptions} title="Assumptions Made" collapsed />
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}