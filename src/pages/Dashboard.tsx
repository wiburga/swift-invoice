import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, FileText, Users, Clock } from "lucide-react";

interface Stats {
  totalInvoices: number;
  pendingInvoices: number;
  totalRevenue: number;
  totalClients: number;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ totalInvoices: 0, pendingInvoices: 0, totalRevenue: 0, totalClients: 0 });
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [recentClients, setRecentClients] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchStats();
    fetchRecent();
  }, [user]);

  const fetchStats = async () => {
    const [invoicesRes, clientsRes] = await Promise.all([
      supabase.from("invoices").select("total, status"),
      supabase.from("clients").select("id"),
    ]);

    const invoices = invoicesRes.data || [];
    const paidTotal = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.total), 0);
    const pending = invoices.filter(i => i.status === "pending").length;

    setStats({
      totalInvoices: invoices.length,
      pendingInvoices: pending,
      totalRevenue: paidTotal,
      totalClients: clientsRes.data?.length || 0,
    });
  };

  const fetchRecent = async () => {
    const [invRes, cliRes] = await Promise.all([
      supabase.from("invoices").select("*, clients(name)").order("created_at", { ascending: false }).limit(5),
      supabase.from("clients").select("*").order("created_at", { ascending: false }).limit(5),
    ]);
    setRecentInvoices(invRes.data || []);
    setRecentClients(cliRes.data || []);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-success/10 text-success border-success/20";
      case "pending": return "bg-warning/10 text-warning border-warning/20";
      case "voided": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "paid": return "Pagada";
      case "pending": return "Pendiente";
      case "voided": return "Anulada";
      default: return status;
    }
  };

  const cards = [
    { title: "Ingresos Totales", value: `$${stats.totalRevenue.toFixed(2)}`, icon: DollarSign, color: "text-success" },
    { title: "Total Facturas", value: stats.totalInvoices, icon: FileText, color: "text-primary" },
    { title: "Pendientes", value: stats.pendingInvoices, icon: Clock, color: "text-warning" },
    { title: "Clientes", value: stats.totalClients, icon: Users, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Facturas Recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentInvoices.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay facturas aún.</p>
            ) : (
              <div className="space-y-3">
                {recentInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-sm">{inv.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">{inv.clients?.name || "Sin cliente"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">${Number(inv.total).toFixed(2)}</span>
                      <Badge variant="outline" className={statusColor(inv.status)}>
                        {statusLabel(inv.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Clientes Recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentClients.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay clientes aún.</p>
            ) : (
              <div className="space-y-3">
                {recentClients.map((cli) => (
                  <div key={cli.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-sm">{cli.name}</p>
                      <p className="text-xs text-muted-foreground">{cli.ruc_cedula}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{cli.email}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
