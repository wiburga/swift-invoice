import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, Trash2, Search, FileDown, X, MessageCircle, RefreshCw,
  ChevronRight, User, Package, CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  ruc_cedula: string;
  email: string | null;
  address: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  iva_rate: number;
}

interface InvoiceItem {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  iva_rate: number;
  subtotal: number;
  iva_amount: number;
  total: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  subtotal: number;
  iva: number;
  total: number;
  status: string;
  issued_at: string;
  clients: { name: string; ruc_cedula: string } | null;
}

const Invoices = () => {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);

  const [selectedClient, setSelectedClient] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");

  useEffect(() => {
    if (user) {
      fetchInvoices();
      fetchClients();
      fetchProducts();
    }
  }, [user]);

  const fetchInvoices = async () => {
    const { data } = await supabase
      .from("invoices")
      .select("*, clients(name, ruc_cedula)")
      .order("created_at", { ascending: false });
    setInvoices(data || []);
  };

  const fetchClients = async () => {
    const { data } = await supabase.from("clients").select("id, name, ruc_cedula, email, address").order("name");
    setClients(data || []);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from("products").select("id, name, price, iva_rate").order("name");
    setProducts(data || []);
  };

  const addProduct = (product: Product) => {
    const qty = 1;
    const subtotal = product.price * qty;
    const ivaAmt = subtotal * (product.iva_rate / 100);
    setItems([
      ...items,
      {
        product_id: product.id,
        description: product.name,
        quantity: qty,
        unit_price: product.price,
        iva_rate: product.iva_rate,
        subtotal,
        iva_amount: ivaAmt,
        total: subtotal + ivaAmt,
      },
    ]);
    setProductSearch("");
  };

  const updateItemQty = (index: number, qty: number) => {
    const updated = [...items];
    const item = updated[index];
    item.quantity = qty;
    item.subtotal = item.unit_price * qty;
    item.iva_amount = item.subtotal * (item.iva_rate / 100);
    item.total = item.subtotal + item.iva_amount;
    setItems(updated);
  };

  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const totals = items.reduce(
    (acc, item) => ({ subtotal: acc.subtotal + item.subtotal, iva: acc.iva + item.iva_amount, total: acc.total + item.total }),
    { subtotal: 0, iva: 0, total: 0 }
  );

  const resetForm = () => {
    setSelectedClient("");
    setItems([]);
    setNotes("");
    setStep(1);
  };

  const handleCreate = async () => {
    if (!user || !selectedClient || items.length === 0) {
      toast.error("Selecciona un cliente y agrega productos");
      return;
    }

    const invoiceNumber = `FAC-${Date.now().toString(36).toUpperCase()}`;

    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        user_id: user.id,
        client_id: selectedClient,
        invoice_number: invoiceNumber,
        subtotal: totals.subtotal,
        iva: totals.iva,
        total: totals.total,
        notes: notes || null,
      })
      .select()
      .single();

    if (error || !invoice) {
      toast.error(error?.message || "Error al crear factura");
      return;
    }

    const invoiceItems = items.map((item) => ({
      invoice_id: invoice.id,
      product_id: item.product_id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      iva_rate: item.iva_rate,
      subtotal: item.subtotal,
      iva_amount: item.iva_amount,
      total: item.total,
    }));

    const { error: itemsError } = await supabase.from("invoice_items").insert(invoiceItems);
    if (itemsError) {
      toast.error(itemsError.message);
      return;
    }

    toast.success(`Factura ${invoiceNumber} creada`);
    setOpen(false);
    resetForm();
    fetchInvoices();
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Estado actualizado");
    fetchInvoices();
  };

  const generatePDF = async (invoice: Invoice) => {
    const { data: invoiceItems } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id);

    const client = invoice.clients;
    const itemsList = invoiceItems || [];

    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Permite las ventanas emergentes"); return; }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Factura ${invoice.invoice_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .title { font-size: 28px; font-weight: 700; color: #6366f1; }
          .invoice-num { font-size: 14px; color: #666; margin-top: 4px; }
          .section { margin-bottom: 24px; }
          .section-title { font-size: 12px; text-transform: uppercase; color: #999; margin-bottom: 8px; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; }
          th { text-align: left; padding: 12px 8px; border-bottom: 2px solid #e5e5e5; font-size: 12px; text-transform: uppercase; color: #999; }
          td { padding: 12px 8px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
          .text-right { text-align: right; }
          .totals { margin-top: 24px; display: flex; justify-content: flex-end; }
          .totals-table { width: 280px; }
          .totals-table td { padding: 6px 8px; }
          .total-row { font-weight: 700; font-size: 18px; border-top: 2px solid #1a1a1a; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
          .status-pending { background: #fef3cd; color: #856404; }
          .status-paid { background: #d4edda; color: #155724; }
          .status-voided { background: #e2e8f0; color: #64748b; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">FACTURA</div>
            <div class="invoice-num">${invoice.invoice_number}</div>
          </div>
          <div style="text-align: right;">
            <div>Fecha: ${new Date(invoice.issued_at).toLocaleDateString('es-EC')}</div>
            <span class="status status-${invoice.status}">
              ${invoice.status === 'paid' ? 'PAGADA' : invoice.status === 'pending' ? 'PENDIENTE' : 'ANULADA'}
            </span>
          </div>
        </div>
        <div class="section">
          <div class="section-title">Cliente</div>
          <div><strong>${client?.name || 'N/A'}</strong></div>
          <div>RUC/Cédula: ${client?.ruc_cedula || 'N/A'}</div>
        </div>
        <table>
          <thead><tr><th>Descripción</th><th class="text-right">Cant.</th><th class="text-right">P. Unit.</th><th class="text-right">IVA</th><th class="text-right">Total</th></tr></thead>
          <tbody>
            ${itemsList.map(item => `<tr><td>${item.description}</td><td class="text-right">${item.quantity}</td><td class="text-right">$${Number(item.unit_price).toFixed(2)}</td><td class="text-right">$${Number(item.iva_amount).toFixed(2)}</td><td class="text-right">$${Number(item.total).toFixed(2)}</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="totals">
          <table class="totals-table">
            <tr><td>Subtotal</td><td class="text-right">$${Number(invoice.subtotal).toFixed(2)}</td></tr>
            <tr><td>IVA</td><td class="text-right">$${Number(invoice.iva).toFixed(2)}</td></tr>
            <tr class="total-row"><td>TOTAL</td><td class="text-right">$${Number(invoice.total).toFixed(2)}</td></tr>
          </table>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const sendWhatsApp = (invoice: Invoice) => {
    const client = invoice.clients;
    const msg = encodeURIComponent(
      `Hola ${client?.name || ""}, adjunto tu factura ${invoice.invoice_number} por $${Number(invoice.total).toFixed(2)}. ¡Gracias por tu preferencia!`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-success/10 text-success border-success/20";
      case "pending": return "bg-warning/10 text-warning border-warning/20";
      case "sri_error": return "bg-destructive/10 text-destructive border-destructive/20";
      case "voided": return "bg-muted text-muted-foreground border-border";
      default: return "";
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "paid": return "Pagada";
      case "pending": return "Pendiente";
      case "sri_error": return "SRI Error";
      case "voided": return "Anulada";
      default: return s;
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filtered = invoices.filter(
    (inv) =>
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      inv.clients?.name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.clients?.ruc_cedula?.includes(search)
  );

  const selectedClientData = clients.find((c) => c.id === selectedClient);

  const stepItems = [
    { num: 1, label: "Cliente", icon: User },
    { num: 2, label: "Ítems", icon: Package },
    { num: 3, label: "Confirmar", icon: CreditCard },
  ];

  const canAdvance = (s: number) => {
    if (s === 1) return !!selectedClient;
    if (s === 2) return items.length > 0;
    return true;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturas</h1>
          <p className="text-muted-foreground text-sm">{invoices.length} facturas registradas</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nueva Factura</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nueva Factura</DialogTitle>
            </DialogHeader>

            {/* Stepper */}
            <div className="flex items-center justify-between mb-6">
              {stepItems.map((s, idx) => (
                <div key={s.num} className="flex items-center flex-1">
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer",
                      step >= s.num
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                    onClick={() => {
                      if (s.num < step || canAdvance(step)) setStep(s.num);
                    }}
                  >
                    <s.icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                  {idx < stepItems.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground mx-2 shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1: Client */}
            {step === 1 && (
              <div className="space-y-4">
                <Label>Seleccionar Cliente *</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger><SelectValue placeholder="Buscar cliente..." /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} — {c.ruc_cedula}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedClientData && (
                  <Card>
                    <CardContent className="p-4 space-y-1 text-sm">
                      <p className="font-medium">{selectedClientData.name}</p>
                      <p className="text-muted-foreground">RUC: {selectedClientData.ruc_cedula}</p>
                      {selectedClientData.email && <p className="text-muted-foreground">{selectedClientData.email}</p>}
                      {selectedClientData.address && <p className="text-muted-foreground">{selectedClientData.address}</p>}
                    </CardContent>
                  </Card>
                )}
                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)} disabled={!selectedClient}>
                    Siguiente <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Items */}
            {step === 2 && (
              <div className="space-y-4">
                <Label>Agregar Producto</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar producto..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-9" />
                </div>
                {productSearch && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto">
                    {filteredProducts.map((p) => (
                      <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between">
                        <span>{p.name}</span>
                        <span className="text-muted-foreground">${Number(p.price).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {items.length > 0 && (
                  <div className="border rounded-lg divide-y">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.description}</p>
                          <p className="text-xs text-muted-foreground">${Number(item.unit_price).toFixed(2)} × {item.quantity}</p>
                        </div>
                        <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItemQty(i, parseInt(e.target.value) || 1)} className="w-20" />
                        <span className="text-sm font-medium w-24 text-right">${item.total.toFixed(2)}</span>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(i)}><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}

                <Separator />
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">IVA (15%)</span><span>${totals.iva.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-lg"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>Atrás</Button>
                  <Button onClick={() => setStep(3)} disabled={items.length === 0}>
                    Siguiente <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === 3 && (
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase">Cliente</p>
                      <p className="font-medium">{selectedClientData?.name}</p>
                      <p className="text-sm text-muted-foreground">{selectedClientData?.ruc_cedula}</p>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase mb-2">Ítems ({items.length})</p>
                      {items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm py-1">
                          <span>{item.description} × {item.quantity}</span>
                          <span>${item.total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <Separator />
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span>${totals.total.toFixed(2)}</span>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <Label>Notas (opcional)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones..." />
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)}>Atrás</Button>
                  <Button onClick={handleCreate} disabled={!selectedClient || items.length === 0}>
                    Crear Factura
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Search bar - supports RUC and client name */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por N° factura, cliente o RUC..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Invoice Table */}
      <Card className="border-0 shadow-md overflow-hidden">
        {filtered.length === 0 ? (
          <CardContent className="py-12 text-center text-muted-foreground">No se encontraron facturas.</CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>N° Factura</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => (
                <TableRow key={inv.id} className="group">
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{inv.clients?.name || "Sin cliente"}</p>
                      <p className="text-xs text-muted-foreground">{inv.clients?.ruc_cedula}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(inv.issued_at), "dd MMM yyyy", { locale: es })}
                  </TableCell>
                  <TableCell className="text-right font-semibold">${Number(inv.total).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColor(inv.status)}>
                      {statusLabel(inv.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Select value={inv.status} onValueChange={(v) => updateStatus(inv.id, v)}>
                        <SelectTrigger className="w-28 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendiente</SelectItem>
                          <SelectItem value="paid">Pagada</SelectItem>
                          <SelectItem value="voided">Anulada</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => generatePDF(inv)} title="Descargar PDF">
                        <FileDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => sendWhatsApp(inv)} title="Enviar por WhatsApp">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Sincronizar SRI" onClick={() => toast.info("Sincronización con SRI próximamente")}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};

export default Invoices;
