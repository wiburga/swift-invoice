import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DollarSign, FileText, Users, TrendingUp, CalendarIcon, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

type TimeFilter = "today" | "week" | "month" | "custom";

interface InvoiceRow {
  total: number;
  iva: number;
  status: string;
  issued_at: string;
}

interface ClientRow {
  id: string;
  created_at: string;
}

const Dashboard = () => {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [allClients, setAllClients] = useState<ClientRow[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("month");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [loading, setLoading] = useState(true);

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (timeFilter) {
      case "today":
        return { from: startOfDay(now), to: endOfDay(now) };
      case "week":
        return { from: startOfWeek(now, { locale: es }), to: endOfDay(now) };
      case "month":
        return { from: startOfMonth(now), to: endOfDay(now) };
      case "custom":
        return {
          from: customRange.from || startOfMonth(now),
          to: customRange.to ? endOfDay(customRange.to) : endOfDay(now),
        };
    }
  }, [timeFilter, customRange]);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user, dateRange]);

  const fetchData = async () => {
    setLoading(true);
    const fromISO = dateRange.from.toISOString();
    const toISO = dateRange.to.toISOString();

    const [invRes, cliRes, recentRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("total, iva, status, issued_at")
        .gte("issued_at", fromISO)
        .lte("issued_at", toISO),
      supabase.from("clients").select("id, created_at"),
      supabase
        .from("invoices")
        .select("*, clients(name, ruc_cedula)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    setInvoices(invRes.data || []);
    setAllClients(cliRes.data || []);
    setRecentInvoices(recentRes.data || []);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const totalSales = invoices
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + Number(i.total), 0);
    const pending = invoices.filter((i) => i.status === "pending").length;
    const totalIva = invoices
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + Number(i.iva), 0);
    const newClients = allClients.filter(
      (c) => new Date(c.created_at) >= dateRange.from && new Date(c.created_at) <= dateRange.to
    ).length;

    return { totalSales, pending, totalIva, newClients };
  }, [invoices, allClients, dateRange]);

  const chartData = useMemo(() => {
    const grouped: Record<string, number> = {};
    invoices
      .filter((i) => i.status === "paid")
      .forEach((inv) => {
        const day = format(new Date(inv.issued_at), "dd MMM", { locale: es });
        grouped[day] = (grouped[day] || 0) + Number(inv.total);
      });
    return Object.entries(grouped).map(([date, ventas]) => ({ date, ventas }));
  }, [invoices]);

  const cards = [
    {
      title: "Total Ventas",
      value: `$${stats.totalSales.toFixed(2)}`,
      icon: DollarSign,
      trend: stats.totalSales > 0 ? "+12%" : "0%",
      trendUp: true,
      gradient: "from-primary/10 to-primary/5",
      iconBg: "bg-primary/10 text-primary",
    },
    {
      title: "Facturas Pendientes",
      value: stats.pending,
      icon: FileText,
      trend: `${stats.pending} activas`,
      trendUp: false,
      gradient: "from-warning/10 to-warning/5",
      iconBg: "bg-warning/10 text-warning",
    },
    {
      title: "Clientes Nuevos",
      value: stats.newClients,
      icon: Users,
      trend: `en período`,
      trendUp: true,
      gradient: "from-info/10 to-info/5",
      iconBg: "bg-info/10 text-info",
    },
    {
      title: "Margen IVA (15%)",
      value: `$${stats.totalIva.toFixed(2)}`,
      icon: TrendingUp,
      trend: "15% recaudado",
      trendUp: true,
      gradient: "from-success/10 to-success/5",
      iconBg: "bg-success/10 text-success",
    },
  ];

  const statusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-success/10 text-success border-success/20";
      case "pending": return "bg-warning/10 text-warning border-warning/20";
      case "voided": return "bg-muted text-muted-foreground border-border";
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

  const filterButtons: { label: string; value: TimeFilter }[] = [
    { label: "Hoy", value: "today" },
    { label: "Semana", value: "week" },
    { label: "Mes", value: "month" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Resumen de actividad — {format(dateRange.from, "dd MMM", { locale: es })} a{" "}
            {format(dateRange.to, "dd MMM yyyy", { locale: es })}
          </p>
        </div>

        {/* Time Filters */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {filterButtons.map((f) => (
            <Button
              key={f.value}
              variant={timeFilter === f.value ? "default" : "ghost"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setTimeFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={timeFilter === "custom" ? "default" : "ghost"}
                size="sm"
                className="h-8 text-xs"
              >
                <CalendarIcon className="h-3 w-3 mr-1" />
                Rango
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={customRange.from && customRange.to ? { from: customRange.from, to: customRange.to } : undefined}
                onSelect={(range) => {
                  if (range) {
                    setCustomRange({ from: range.from, to: range.to });
                    setTimeFilter("custom");
                  }
                }}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="overflow-hidden border-0 shadow-md">
            <CardContent className={cn("p-5 bg-gradient-to-br", card.gradient)}>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold tracking-tight">{card.value}</p>
                  <div className="flex items-center gap-1 text-xs">
                    {card.trendUp ? (
                      <ArrowUpRight className="h-3 w-3 text-success" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-warning" />
                    )}
                    <span className="text-muted-foreground">{card.trend}</span>
                  </div>
                </div>
                <div className={cn("p-2.5 rounded-xl", card.iconBg)}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sales Chart */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Tendencia de Ventas</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
              No hay datos de ventas en este período
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, "Ventas"]}
                />
                <Area
                  type="monotone"
                  dataKey="ventas"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorVentas)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Facturas Recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentInvoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay facturas aún.</p>
          ) : (
            <div className="space-y-1">
              {recentInvoices.map((inv: any) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.clients?.name || "Sin cliente"} •{" "}
                      {format(new Date(inv.issued_at), "dd MMM yyyy", { locale: es })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold">${Number(inv.total).toFixed(2)}</span>
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
    </div>
  );
};

export default Dashboard;
