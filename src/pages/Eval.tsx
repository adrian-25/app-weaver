import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'framer-motion';
import { Activity, Clock, RotateCcw, CheckCircle2 } from 'lucide-react';

export default function Eval() {
  const { user } = useAuth();

  const { data: projects = [] } = useQuery({
    queryKey: ['eval-projects', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, pipeline_stages(*), final_schemas(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const totalProjects = projects.length;
  const completedProjects = projects.filter((p) => p.status === 'completed').length;
  const avgLatency = totalProjects > 0
    ? projects.reduce((sum, p) => {
        const stages = (p as any).pipeline_stages || [];
        return sum + stages.reduce((s: number, st: any) => s + (st.latency_ms || 0), 0);
      }, 0) / totalProjects
    : 0;
  const totalRetries = projects.reduce((sum, p) => {
    const stages = (p as any).pipeline_stages || [];
    return sum + stages.reduce((s: number, st: any) => s + (st.retries || 0), 0);
  }, 0);

  const chartData = projects.slice(0, 10).map((p) => {
    const stages = (p as any).pipeline_stages || [];
    const latency = stages.reduce((s: number, st: any) => s + (st.latency_ms || 0), 0);
    return { name: (p.title || '').slice(0, 15), latency: Math.round(latency / 1000) };
  });

  const cards = [
    { icon: Activity, label: 'Total Projects', value: totalProjects },
    { icon: CheckCircle2, label: 'Completed', value: completedProjects },
    { icon: Clock, label: 'Avg Latency', value: `${(avgLatency / 1000).toFixed(1)}s` },
    { icon: RotateCcw, label: 'Total Retries', value: totalRetries },
  ];

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
    </div>
  );
}