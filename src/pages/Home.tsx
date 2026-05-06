import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const examples = [
  'CRM with contacts, dashboard, role-based access, admin analytics',
  'SaaS project tracker with teams, tasks, comments, and billing',
  'E-commerce store with products, cart, payments, and seller dashboard',
];

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { setShowAuthModal } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (prompt.length < 20) {
      toast.error('Please describe your app in more detail (at least 20 characters)');
      return;
    }
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    setLoading(true);
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .insert({ user_id: user.id, title: prompt.slice(0, 60), original_prompt: prompt })
        .select()
        .single();
      if (error) throw error;

      // Fire edge function (don't await — we'll poll)
      supabase.functions.invoke('run-pipeline', {
        body: { projectId: project.id, prompt },
      }).catch(console.error);

      toast.success('Pipeline started!');
      navigate(`/project/${project.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-2xl space-y-8 text-center"
      >
        <div className="space-y-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 glow-primary"
          >
            <Zap className="h-8 w-8 text-primary" />
          </motion.div>
          <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
            Describe your app.
            <br />
            <span className="text-primary">We'll architect it.</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            AppForge compiles natural language into a complete, validated app schema — UI, API, database, and auth.
          </p>
        </div>

        <div className="space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the app you want to build..."
            rows={4}
            className="w-full resize-none rounded-xl border border-border bg-card p-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-body transition-shadow"
          />
          {prompt.length > 0 && prompt.length < 20 && (
            <p className="text-sm text-destructive">Please describe your app in more detail</p>
          )}
          <Button
            onClick={handleSubmit}
            disabled={loading || prompt.length < 20}
            size="lg"
            className="w-full sm:w-auto glow-primary"
          >
            {loading ? 'Starting...' : 'Generate App Schema'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Try an example</p>
          <div className="flex flex-wrap justify-center gap-2">
            {examples.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}