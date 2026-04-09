import { ShieldCheck } from "lucide-react";
import Layout from "@/components/Layout";

const PrivacyPage = () => {
  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
        <section className="bg-card rounded-lg border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Privacy policy content is not configured yet. Information missing.
          </p>
        </section>
      </main>
    </Layout>
  );
};

export default PrivacyPage;
