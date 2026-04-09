import { Mail, Users, Eye } from "lucide-react";
import Layout from "@/components/Layout";

const CONTACTS = [
  { name: "Rishabh Tiwari", email: "rishtiwari98@gmail.com" },
  { name: "Florian Sprick", email: "florian.sprick@hotmail.com" },
  { name: "Vinayak Joshi", email: "vinayakjoshi2001@gmail.com" },
  { name: "Gonzalo Baonza", email: "Gonzalobaonza@gmail.com" },
  { name: "Anton Kantsemal", email: "str4tum@gmail.com" },
] as const;

const AboutPage = () => {
  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
        <section className="bg-card rounded-lg border shadow-sm p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">About Us</h1>
          </div>
          <p className="text-sm text-muted-foreground leading-6">
            Our vision is to make supply chain decisions transparent, data-driven, and actionable for every team.
            SupplyWise AI helps organizations evaluate suppliers, compare alternatives, and understand compliance and
            sourcing trade-offs with clarity and speed.
          </p>
        </section>

        <section className="bg-card rounded-lg border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Contact Details</h2>
          </div>
          <div className="space-y-3">
            {CONTACTS.map((contact, index) => (
              <div key={contact.name} className="flex items-start justify-between gap-4 border-b last:border-b-0 pb-3 last:pb-0">
                <div className="text-sm">
                  <span className="font-medium">{index + 1}. {contact.name}</span>
                </div>
                <div className="text-sm text-right">
                  {contact.email ? (
                    <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Mail className="w-3.5 h-3.5" />
                      {contact.email}
                    </a>
                  ) : (
                    <span className="text-muted-foreground italic">Information missing</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </Layout>
  );
};

export default AboutPage;
