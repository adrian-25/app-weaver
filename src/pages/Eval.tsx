import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'framer-motion';
import { Activity, Clock, RotateCcw, CheckCircle2 } from 'lucide-react';

interface EvaluationRun {
  id: string;
  project_id: string;
  success_rate: number;
  total_retries: number;
  failure_types: string[];
  total_latency_ms: number;
  stage_latencies: Record<string, number>;
  created_at: string;
  projects: {
    title: string;
  };
}

export default function Eval() {
  const { user } = useAuth();

  const { data: evalRuns = [] } = useQuery({
    queryKey: ['evaluation-runs', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evaluation_runs')
        .select('*, projects(title)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as EvaluationRun[];
    },
    enabled: !!user,
  });

  const totalProjects = evalRuns.length;
  const avgSuccessRate = totalProjects > 0
    ? (evalRuns.reduce((sum, run) => sum + (run.success_rate || 0), 0) / totalProjects * 100).toFixed(0)
    : '0';
  const avgLatency = totalProjects > 0
    ? evalRuns.reduce((sum, run) => sum + (run.total_latency_ms || 0), 0) / totalProjects
    : 0;
  const totalRetries = evalRuns.reduce((sum, run) => sum + (run.total_retries || 0), 0);

  const cards = [
    { icon: Activity, label: 'Total Projects', value: totalProjects },
    { icon: CheckCircle2, label: 'Avg Success Rate', value: `${avgSuccessRate}%` },
    { icon: Clock, label: 'Avg Latency', value: `${(avgLatency / 1000).toFixed(1)}s` },
    { icon: RotateCcw, label: 'Total Retries', value: totalRetries },
  ];

  const chartData = evalRuns.slice(0, 10).map((run) => ({
    name: (run.projects?.title || 'Untitled').slice(0, 15),
    latency: Math.round((run.total_latency_ms || 0) / 1000),
  }));

  const tableData = evalRuns.map((run) => ({
    id: run.id,
    project: run.projects?.title || 'Untitled',
    successRate: `${Math.round((run.success_rate || 0) * 100)}%`,
    retries: run.total_retries || 0,
    latency: `${((run.total_latency_ms || 0) / 1000).toFixed(1)}s`,
    failureTypes: (run.failure_types || []).join(', ') || 'None',
    date: new Date(run.created_at).toLocaleDateString(),
  }));

  return (
    <div className="container py-8 space-y-8">
      <h1 className="font-heading text-2xl font-bold">Evaluation Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-xl border border-border bg-card p-5 text-center"
          >
            <c.icon className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-heading font-bold">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
          </motion.div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="font-heading font-semibold mb-4">Latency by Project (seconds)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 15% 15%)" />
              <XAxis dataKey="name" tick={{ fill: 'hsl(220 10% 50%)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'hsl(220 10% 50%)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(240 18% 7%)', border: '1px solid hsl(240 15% 15%)', borderRadius: 8 }}
                labelStyle={{ color: 'hsl(220 20% 92%)' }}
              />
              <Bar dataKey="latency" radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={`hsl(245 80% ${60 + i * 3}%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {tableData.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <h3 className="font-heading font-semibold p-4 border-b border-border bg-secondary/30">Evaluation Runs</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider">Project</th>
                <th className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider">Success Rate</th>
                <th className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider">Retries</th>
                <th className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider">Latency</th>
                <th className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider">Failure Types</th>
                <th className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 font-medium truncate max-w-xs">{row.project}</td>
                  <td className="px-4 py-3">{row.successRate}</td>
                  <td className="px-4 py-3">{row.retries}</td>
                  <td className="px-4 py-3">{row.latency}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{row.failureTypes}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}