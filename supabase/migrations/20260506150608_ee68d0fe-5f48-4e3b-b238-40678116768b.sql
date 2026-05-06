
-- Projects table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  original_prompt text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- Pipeline stages table
CREATE TABLE public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  stage_name text NOT NULL,
  stage_order int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  input_data jsonb,
  output_data jsonb,
  error_message text,
  retries int NOT NULL DEFAULT 0,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pipeline stages" ON public.pipeline_stages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE id = pipeline_stages.project_id AND user_id = auth.uid()));
CREATE POLICY "Users can create own pipeline stages" ON public.pipeline_stages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE id = pipeline_stages.project_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own pipeline stages" ON public.pipeline_stages FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.projects WHERE id = pipeline_stages.project_id AND user_id = auth.uid()));

-- Service role policy for edge function writes
CREATE POLICY "Service role full access pipeline_stages" ON public.pipeline_stages FOR ALL
  USING (auth.role() = 'service_role');

-- Final schemas table
CREATE TABLE public.final_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  ui_schema jsonb,
  api_schema jsonb,
  db_schema jsonb,
  auth_schema jsonb,
  business_logic jsonb,
  validation_report jsonb,
  assumptions jsonb,
  is_valid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.final_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own final schemas" ON public.final_schemas FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE id = final_schemas.project_id AND user_id = auth.uid()));
CREATE POLICY "Users can create own final schemas" ON public.final_schemas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE id = final_schemas.project_id AND user_id = auth.uid()));
CREATE POLICY "Service role full access final_schemas" ON public.final_schemas FOR ALL
  USING (auth.role() = 'service_role');

-- Evaluation runs table
CREATE TABLE public.evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  success_rate numeric,
  total_retries int,
  failure_types jsonb,
  total_latency_ms int,
  stage_latencies jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.evaluation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own evaluation runs" ON public.evaluation_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE id = evaluation_runs.project_id AND user_id = auth.uid()));
CREATE POLICY "Users can create own evaluation runs" ON public.evaluation_runs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE id = evaluation_runs.project_id AND user_id = auth.uid()));
CREATE POLICY "Service role full access evaluation_runs" ON public.evaluation_runs FOR ALL
  USING (auth.role() = 'service_role');

-- Service role policy for projects (edge function updates status)
CREATE POLICY "Service role full access projects" ON public.projects FOR ALL
  USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
