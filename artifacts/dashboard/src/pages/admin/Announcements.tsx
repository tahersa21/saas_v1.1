import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/authFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, Plus, Megaphone } from "lucide-react";

interface Announcement {
  id: number;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  type: string;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
}

const TYPES = ["info", "update", "promo", "maintenance", "warning"];

const TYPE_LABEL_AR: Record<string, string> = {
  info: "معلومة",
  update: "تحديث",
  promo: "عرض",
  maintenance: "صيانة",
  warning: "تحذير",
};

const TYPE_COLOR: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  update: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  promo: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  maintenance: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  warning: "bg-red-500/10 text-red-400 border-red-500/30",
};

export default function AdminAnnouncements() {
  const { t } = useTranslation();
  const isAr = i18n.language === "ar";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Partial<Announcement> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const res = await authFetch("/api/admin/announcements");
      if (!res.ok) throw new Error("Failed to load announcements");
      return (await res.json()) as { announcements: Announcement[] };
    },
  });

  const save = useMutation({
    mutationFn: async (payload: Partial<Announcement>) => {
      const url = payload.id
        ? `/api/admin/announcements/${payload.id}`
        : "/api/admin/announcements";
      const method = payload.id ? "PATCH" : "POST";
      const res = await authFetch(url, { method, body: JSON.stringify(payload) });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Save failed");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      setEditing(null);
      toast({ title: isAr ? "تم الحفظ" : "Saved" });
    },
    onError: (err: Error) => toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-announcements"] }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await authFetch(`/api/admin/announcements/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Toggle failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-announcements"] }),
  });

  return (
    <div className={`space-y-6 ${isAr ? "text-right" : ""}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" />
            {isAr ? "إشعارات المنصة" : "Announcements"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAr
              ? "أرسل رسائل وتحديثات لجميع المستخدمين عند فتح المنصة"
              : "Send messages and updates to all users when they open the platform"}
          </p>
        </div>
        <Button
          onClick={() => setEditing({ type: "info", isActive: true })}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> {isAr ? "إشعار جديد" : "New announcement"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isAr ? "كل الإشعارات" : "All announcements"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : !data?.announcements.length ? (
            <p className="text-sm text-muted-foreground">
              {isAr ? "لا توجد إشعارات بعد" : "No announcements yet"}
            </p>
          ) : (
            <div className="space-y-3">
              {data.announcements.map((a) => (
                <div
                  key={a.id}
                  className="border rounded-lg p-4 flex items-start justify-between gap-3 flex-wrap"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{isAr ? a.titleAr : a.titleEn}</p>
                      <Badge
                        variant="outline"
                        className={TYPE_COLOR[a.type] ?? ""}
                      >
                        {isAr ? TYPE_LABEL_AR[a.type] ?? a.type : a.type}
                      </Badge>
                      {!a.isActive && (
                        <Badge variant="outline" className="bg-gray-500/10 text-gray-400">
                          {isAr ? "معطل" : "Inactive"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {isAr ? a.bodyAr : a.bodyEn}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(a.createdAt).toLocaleString()}
                      {a.expiresAt && (
                        <>
                          {" • "}
                          {isAr ? "ينتهي:" : "Expires:"} {new Date(a.expiresAt).toLocaleString()}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={a.isActive}
                      onCheckedChange={(v) => toggleActive.mutate({ id: a.id, isActive: v })}
                    />
                    <Button variant="ghost" size="icon" onClick={() => setEditing(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(isAr ? "هل أنت متأكد؟" : "Are you sure?")) del.mutate(a.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing?.id
                ? isAr ? "تعديل الإشعار" : "Edit announcement"
                : isAr ? "إشعار جديد" : "New announcement"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>{isAr ? "العنوان (إنجليزي)" : "Title (English)"}</Label>
                <Input
                  value={editing?.titleEn ?? ""}
                  onChange={(e) => setEditing({ ...editing, titleEn: e.target.value })}
                />
              </div>
              <div>
                <Label>{isAr ? "العنوان (عربي)" : "Title (Arabic)"}</Label>
                <Input
                  value={editing?.titleAr ?? ""}
                  onChange={(e) => setEditing({ ...editing, titleAr: e.target.value })}
                  dir="rtl"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>{isAr ? "النص (إنجليزي)" : "Body (English)"}</Label>
                <Textarea
                  value={editing?.bodyEn ?? ""}
                  onChange={(e) => setEditing({ ...editing, bodyEn: e.target.value })}
                  rows={4}
                />
              </div>
              <div>
                <Label>{isAr ? "النص (عربي)" : "Body (Arabic)"}</Label>
                <Textarea
                  value={editing?.bodyAr ?? ""}
                  onChange={(e) => setEditing({ ...editing, bodyAr: e.target.value })}
                  dir="rtl"
                  rows={4}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>{isAr ? "النوع" : "Type"}</Label>
                <Select
                  value={editing?.type ?? "info"}
                  onValueChange={(v) => setEditing({ ...editing, type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((tp) => (
                      <SelectItem key={tp} value={tp}>
                        {isAr ? TYPE_LABEL_AR[tp] : tp}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isAr ? "تاريخ الانتهاء (اختياري)" : "Expires at (optional)"}</Label>
                <Input
                  type="datetime-local"
                  value={
                    editing?.expiresAt
                      ? new Date(editing.expiresAt).toISOString().slice(0, 16)
                      : ""
                  }
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={editing?.isActive !== false}
                onCheckedChange={(v) => setEditing({ ...editing, isActive: v })}
              />
              <Label>{isAr ? "نشط (سيظهر للمستخدمين)" : "Active (visible to users)"}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => save.mutate(editing!)}
              disabled={save.isPending || !editing?.titleEn || !editing?.titleAr}
            >
              {isAr ? "حفظ" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
