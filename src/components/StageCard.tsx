import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, Clock, RotateCcw } from 'lucide-react';
import { JsonViewer } from './JsonViewer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const stageLabels: Record<string, string> = {
  intent_extraction: '1. Intent Extraction',
  system_design: '2. System Design',
  schema_generation: '3. Schema Generation',
  refinement: '4. Refinement & Validation',
};

interface StageCardProps {
  stage: {
    id: string;
    stage_name: string;
    status: string;
    output_data: any;
    error_message: string | null;
    latency_ms: number | null;
    retries: number;
  };
  index: number;
  onRetry?: (stageId: string) => void;
}

export function StageCard({ stage, index, onRetry }: StageCardProps) {
  const statusIcon = {
    pending: <Clock className="h-5 w-5 text-muted-foreground" />,
    running: <Loader2 className="h-5 w-5 text-primary animate-spin" />,
    completed: <CheckCircle2 className="h-5 w-5 text-success" />,
    failed: <XCircle className="h-5 w-5 text-destructive" />,
  }[stage.status] ?? <Clock className="h-5 w-5 text-muted-foreground" />;

  const statusBadge = {
    pending: <Badge variant="secondary">Pending</Badge>,
    running: <Badge className="bg-primary/20 text-primary border-primary/30 animate-pulse">Running...</Badge>,
    completed: <Badge className="bg-success/20 text-success border-success/30">Completed</Badge>,
    failed: <Badge variant="destructive">Failed</Badge>,
  }[stage.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
      className="rounded-xl border border-border bg-card p-5 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {statusIcon}
          <h3 className="font-heading font-semibold">
            {stageLabels[stage.stage_name] || stage.stage_name}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {stage.retries > 0 && (
            <span className="text-xs text-warning">Retries: {stage.retries}</span>
          )}
          {stage.latency_ms != null && (
            <span className="text-xs text-muted-foreground">{stage.latency_ms}ms</span>
          )}
          {statusBadge}
        </div>
      </div>

      {stage.status === 'running' && (
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: ['0%', '80%', '60%', '90%'] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      )}

      {stage.status === 'completed' && stage.output_data && (
        <JsonViewer data={stage.output_data} title="Output" collapsed />
      )}

      {stage.status === 'failed' && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{stage.error_message}</p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={() => onRetry(stage.id)}>
              <RotateCcw className="mr-1.5 h-3 w-3" /> Retry Stage
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}