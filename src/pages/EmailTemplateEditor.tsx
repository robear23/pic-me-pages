import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Upload, Send, Monitor, Smartphone, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { EmailPreview } from "@/components/EmailPreview";
import { EmailVariableReference } from "@/components/EmailVariableReference";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const templateSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(100, "Subject must be less than 100 characters"),
  headerTitle: z.string().min(1, "Header title is required"),
  openingParagraph: z.string().min(1, "Opening paragraph is required"),
  step1Title: z.string().min(1, "Step 1 title is required"),
  step1Description: z.string().min(1, "Step 1 description is required"),
  step2Title: z.string().min(1, "Step 2 title is required"),
  step2Description: z.string().min(1, "Step 2 description is required"),
  step3Title: z.string().min(1, "Step 3 title is required"),
  step3Description: z.string().min(1, "Step 3 description is required"),
  footerTagline: z.string().min(1, "Footer tagline is required"),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
});

type TemplateFormData = z.infer<typeof templateSchema>;

export default function EmailTemplateEditor() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showTestEmailDialog, setShowTestEmailDialog] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [templateName, setTemplateName] = useState("");
  const [lastPublished, setLastPublished] = useState<string | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionHistory, setVersionHistory] = useState<any[]>([]);

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      subject: "",
      headerTitle: "",
      openingParagraph: "",
      step1Title: "",
      step1Description: "",
      step2Title: "",
      step2Description: "",
      step3Title: "",
      step3Description: "",
      footerTagline: "",
      primaryColor: "#7c3aed",
      accentColor: "#faf5ff",
    },
  });

  const formValues = form.watch();
  const isDirty = form.formState.isDirty;

  useEffect(() => {
    if (templateId) {
      fetchTemplate();
    }
  }, [templateId]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      handleSaveDraft(true);
    }, 30000);

    return () => clearTimeout(timer);
  }, [formValues, isDirty]);

  async function fetchTemplate() {
    try {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (error) throw error;

      const content = data.content as any;
      form.reset({
        subject: content.subject || "",
        headerTitle: content.headerTitle || "",
        openingParagraph: content.openingParagraph || "",
        step1Title: content.step1Title || "",
        step1Description: content.step1Description || "",
        step2Title: content.step2Title || "",
        step2Description: content.step2Description || "",
        step3Title: content.step3Title || "",
        step3Description: content.step3Description || "",
        footerTagline: content.footerTagline || "",
        primaryColor: data.primary_color,
        accentColor: data.accent_color,
      });

      setTemplateName(data.display_name);
      setLastPublished(data.last_published_at);
      setVersionHistory(Array.isArray(data.version_history) ? data.version_history : []);
    } catch (error: any) {
      console.error("Error fetching template:", error);
      toast.error("Failed to load template");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveDraft(isAutoSave = false) {
    if (!templateId) return;

    setSaving(true);
    try {
      const values = form.getValues();
      const content = {
        subject: values.subject,
        headerTitle: values.headerTitle,
        openingParagraph: values.openingParagraph,
        step1Title: values.step1Title,
        step1Description: values.step1Description,
        step2Title: values.step2Title,
        step2Description: values.step2Description,
        step3Title: values.step3Title,
        step3Description: values.step3Description,
        footerTagline: values.footerTagline,
      };

      const { error } = await supabase
        .from("email_templates")
        .update({
          content,
          primary_color: values.primaryColor,
          accent_color: values.accentColor,
          last_edited_at: new Date().toISOString(),
        })
        .eq("id", templateId);

      if (error) throw error;

      form.reset(values);
      toast.success(isAutoSave ? "Auto-saved" : "Draft saved successfully");
    } catch (error: any) {
      console.error("Error saving draft:", error);
      toast.error("Failed to save draft");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!templateId) return;

    setPublishing(true);
    try {
      const values = form.getValues();
      const content = {
        subject: values.subject,
        headerTitle: values.headerTitle,
        openingParagraph: values.openingParagraph,
        step1Title: values.step1Title,
        step1Description: values.step1Description,
        step2Title: values.step2Title,
        step2Description: values.step2Description,
        step3Title: values.step3Title,
        step3Description: values.step3Description,
        footerTagline: values.footerTagline,
      };

      // Add to version history
      const newVersion = {
        version: versionHistory.length + 1,
        content,
        colors: {
          primary: values.primaryColor,
          accent: values.accentColor,
        },
        publishedAt: new Date().toISOString(),
      };

      const updatedHistory = [...versionHistory, newVersion].slice(-5); // Keep last 5

      const { error } = await supabase
        .from("email_templates")
        .update({
          content,
          primary_color: values.primaryColor,
          accent_color: values.accentColor,
          is_published: true,
          last_published_at: new Date().toISOString(),
          last_edited_at: new Date().toISOString(),
          version_history: updatedHistory,
        })
        .eq("id", templateId);

      if (error) throw error;

      form.reset(values);
      setVersionHistory(updatedHistory);
      setLastPublished(new Date().toISOString());
      toast.success("Template published successfully");
      setShowPublishDialog(false);
    } catch (error: any) {
      console.error("Error publishing template:", error);
      toast.error("Failed to publish template");
    } finally {
      setPublishing(false);
    }
  }

  async function handleSendTestEmail() {
    setSendingTest(true);
    try {
      const values = form.getValues();
      
      // First save the current draft
      await handleSaveDraft(true);

      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          templateName: "order_confirmation",
          recipientEmail: testEmail,
          variables: {
            customerName: "Sarah Johnson",
            childName: "Emma",
            interests: "Dinosaurs, Space, Ocean Animals",
            orderId: "CMB-12345",
            orderDate: "November 20, 2025",
            totalAmount: "$34.99",
          },
        },
      });

      if (error) throw error;

      toast.success(`Test email sent to ${testEmail}`);
      setShowTestEmailDialog(false);
      setTestEmail("");
    } catch (error: any) {
      console.error("Error sending test email:", error);
      toast.error(error.message || "Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  }

  function handleRestoreVersion(version: any) {
    form.reset({
      subject: version.content.subject,
      headerTitle: version.content.headerTitle,
      openingParagraph: version.content.openingParagraph,
      step1Title: version.content.step1Title,
      step1Description: version.content.step1Description,
      step2Title: version.content.step2Title,
      step2Description: version.content.step2Description,
      step3Title: version.content.step3Title,
      step3Description: version.content.step3Description,
      footerTagline: version.content.footerTagline,
      primaryColor: version.colors.primary,
      accentColor: version.colors.accent,
    });
    toast.success("Version restored - remember to save");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-blue-900/20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50">
        <div className="max-w-[1800px] mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/admin/emails")}
                className="rounded-full"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{templateName}</h1>
                {lastPublished && (
                  <p className="text-sm text-muted-foreground">
                    Last published:{" "}
                    {new Date(lastPublished).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setShowTestEmailDialog(true)}
                disabled={saving || publishing}
              >
                <Send className="h-4 w-4 mr-2" />
                Send Test Email
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSaveDraft()}
                disabled={!isDirty || saving || publishing}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Draft"}
                {isDirty && !saving && <span className="ml-2 h-2 w-2 rounded-full bg-orange-500"></span>}
              </Button>
              <Button
                onClick={() => setShowPublishDialog(true)}
                disabled={saving || publishing}
              >
                <Upload className="h-4 w-4 mr-2" />
                {publishing ? "Publishing..." : "Publish"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1800px] mx-auto px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Editor */}
          <div className="space-y-6">
            <EmailVariableReference />

            <Card className="bg-background/50 backdrop-blur-sm border-white/20">
              <CardHeader>
                <CardTitle>Email Content</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject Line</Label>
                  <Input
                    id="subject"
                    {...form.register("subject")}
                    placeholder="Order Confirmed! 🎨"
                  />
                  {form.formState.errors.subject && (
                    <p className="text-sm text-destructive">{form.formState.errors.subject.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="headerTitle">Header Title</Label>
                  <Input
                    id="headerTitle"
                    {...form.register("headerTitle")}
                    placeholder="Order Confirmed! 🎨"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="openingParagraph">Opening Paragraph</Label>
                  <Textarea
                    id="openingParagraph"
                    {...form.register("openingParagraph")}
                    rows={3}
                    placeholder="Thank you for your order!..."
                  />
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4">What Happens Next - Steps</h3>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Step 1 Title</Label>
                      <Input {...form.register("step1Title")} placeholder="AI Generation" />
                    </div>
                    <div className="space-y-2">
                      <Label>Step 1 Description</Label>
                      <Textarea {...form.register("step1Description")} rows={2} />
                    </div>

                    <div className="space-y-2">
                      <Label>Step 2 Title</Label>
                      <Input {...form.register("step2Title")} placeholder="Professional Printing" />
                    </div>
                    <div className="space-y-2">
                      <Label>Step 2 Description</Label>
                      <Textarea {...form.register("step2Description")} rows={2} />
                    </div>

                    <div className="space-y-2">
                      <Label>Step 3 Title</Label>
                      <Input {...form.register("step3Title")} placeholder="Shipping" />
                    </div>
                    <div className="space-y-2">
                      <Label>Step 3 Description</Label>
                      <Textarea {...form.register("step3Description")} rows={2} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="footerTagline">Footer Tagline</Label>
                  <Textarea
                    id="footerTagline"
                    {...form.register("footerTagline")}
                    rows={2}
                    placeholder="Creating magical memories, one story at a time"
                  />
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4">Brand Colors</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">Primary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="primaryColor"
                          type="color"
                          {...form.register("primaryColor")}
                          className="w-20 h-10"
                        />
                        <Input
                          value={formValues.primaryColor}
                          onChange={(e) => form.setValue("primaryColor", e.target.value)}
                          placeholder="#7c3aed"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accentColor">Accent Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="accentColor"
                          type="color"
                          {...form.register("accentColor")}
                          className="w-20 h-10"
                        />
                        <Input
                          value={formValues.accentColor}
                          onChange={(e) => form.setValue("accentColor", e.target.value)}
                          placeholder="#faf5ff"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Version History */}
            {versionHistory.length > 0 && (
              <Card className="bg-background/50 backdrop-blur-sm border-white/20">
                <CardHeader className="cursor-pointer" onClick={() => setShowVersionHistory(!showVersionHistory)}>
                  <div className="flex items-center justify-between">
                    <CardTitle>Version History ({versionHistory.length})</CardTitle>
                    {showVersionHistory ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </div>
                </CardHeader>
                {showVersionHistory && (
                  <CardContent>
                    <div className="space-y-3">
                      {versionHistory.slice().reverse().map((version, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <div>
                            <p className="font-medium">Version {version.version}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(version.publishedAt).toLocaleString()}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestoreVersion(version)}
                          >
                            Restore
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </div>

          {/* Preview */}
          <div className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
            <Card className="bg-background/50 backdrop-blur-sm border-white/20 h-full flex flex-col">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle>Live Preview</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant={previewMode === "desktop" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPreviewMode("desktop")}
                    >
                      <Monitor className="h-4 w-4 mr-2" />
                      Desktop
                    </Button>
                    <Button
                      variant={previewMode === "mobile" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPreviewMode("mobile")}
                    >
                      <Smartphone className="h-4 w-4 mr-2" />
                      Mobile
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                <EmailPreview
                  content={{
                    subject: formValues.subject || "",
                    headerTitle: formValues.headerTitle || "",
                    openingParagraph: formValues.openingParagraph || "",
                    step1Title: formValues.step1Title || "",
                    step1Description: formValues.step1Description || "",
                    step2Title: formValues.step2Title || "",
                    step2Description: formValues.step2Description || "",
                    step3Title: formValues.step3Title || "",
                    step3Description: formValues.step3Description || "",
                    footerTagline: formValues.footerTagline || "",
                    primaryColor: formValues.primaryColor || "#7c3aed",
                    accentColor: formValues.accentColor || "#faf5ff",
                  }}
                  mode={previewMode}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Publish Confirmation Dialog */}
      <AlertDialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the email all customers receive. Are you sure you want to publish these changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublish}>Publish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test Email Dialog */}
      <Dialog open={showTestEmailDialog} onOpenChange={setShowTestEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Enter an email address to receive a test of the current template
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="testEmail">Email Address</Label>
              <Input
                id="testEmail"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestEmailDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendTestEmail} disabled={!testEmail || sendingTest}>
              {sendingTest ? "Sending..." : "Send Test Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
