import { User } from "lucide-react";
import Layout from "@/components/Layout";

const ProfilePage = () => {
  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
        <section className="bg-card rounded-lg border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            User profile details are not configured yet. Information missing.
          </p>
        </section>
      </main>
    </Layout>
  );
};

export default ProfilePage;
