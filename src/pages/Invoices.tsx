import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Search, FileDown, X } from "lucide-react";
import { toast } from "sonner";

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

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totals = items.reduce(
    (acc, item) => ({
      subtotal: acc.subtotal + item.subtotal,
      iva: acc.iva + item.iva_amount,
      total: acc.total + item.total,
    }),
    { subtotal: 0, iva: 0, total: 0 }
  );

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
    setSelectedClient("");
    setItems([]);
    setNotes("");
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
          .title { font-size: 28px; font-weight: 700; color: #0d9668; }
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
          .status-voided { background: #f8d7da; color: #721c24; }
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
          <thead>
            <tr>
              <th>Descripción</th>
              <th class="text-right">Cant.</th>
              <th class="text-right">P. Unit.</th>
              <th class="text-right">IVA</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsList.map(item => `
              <tr>
                <td>${item.description}</td>
                <td class="text-right">${item.quantity}</td>
                <td class="text-right">$${Number(item.unit_price).toFixed(2)}</td>
                <td class="text-right">$${Number(item.iva_amount).toFixed(2)}</td>
                <td class="text-right">$${Number(item.total).toFixed(2)}</td>
              </tr>
            `).join('')}
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

  const statusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-success/10 text-success border-success/20";
      case "pending": return "bg-warning/10 text-warning border-warning/20";
      case "voided": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "";
    }
  };

  const statusLabel = (s: string) =>
    s === "paid" ? "Pagada" : s === "pending" ? "Pendiente" : "Anulada";

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filtered = invoices.filter(
    (inv) =>
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      inv.clients?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Facturas</h1>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSelectedClient(""); setItems([]); setNotes(""); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nueva Factura</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nueva Factura</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} — {c.ruc_cedula}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Agregar Producto</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar producto..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {productSearch && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto">
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addProduct(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between"
                      >
                        <span>{p.name}</span>
                        <span className="text-muted-foreground">${Number(p.price).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {items.length > 0 && (
                <div className="space-y-2">
                  <Label>Ítems</Label>
                  <div className="border rounded-lg divide-y">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.description}</p>
                          <p className="text-xs text-muted-foreground">${Number(item.unit_price).toFixed(2)} × {item.quantity}</p>
                        </div>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItemQty(i, parseInt(e.target.value) || 1)}
                          className="w-20"
                        />
                        <span className="text-sm font-medium w-24 text-right">${item.total.toFixed(2)}</span>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(i)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>${totals.iva.toFixed(2)}</span></div>
                    <div className="flex justify-between font-bold text-lg"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Notas (opcional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones..." />
              </div>

              <Button onClick={handleCreate} className="w-full" disabled={!selectedClient || items.length === 0}>
                Crear Factura
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar factura..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No se encontraron facturas.</CardContent></Card>
        ) : (
          filtered.map((inv) => (
            <Card key={inv.id}>
              <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{inv.invoice_number}</p>
                    <Badge variant="outline" className={statusColor(inv.status)}>
                      {statusLabel(inv.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {inv.clients?.name || "Sin cliente"} • {new Date(inv.issued_at).toLocaleDateString("es-EC")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-lg font-semibold">${Number(inv.total).toFixed(2)}</span>
                  <Select value={inv.status} onValueChange={(v) => updateStatus(inv.id, v)}>
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="paid">Pagada</SelectItem>
                      <SelectItem value="voided">Anulada</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={() => generatePDF(inv)}>
                    <FileDown className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default Invoices;
