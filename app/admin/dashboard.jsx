import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Users, MapPin, CheckCircle, Upload, Settings, Loader2 } from 'lucide-react';
import VendorLoginTable from '@/components/admin/VendorLoginTable';
import VendorApprovalList from '@/components/admin/VendorApprovalList';
import MapEditor from '@/components/map/MapEditor';
import { toast } from 'sonner';

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [uploadingMap, setUploadingMap] = useState(false);

  const { data: vendors = [], isLoading: loadingVendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list('-created_date'),
  });

  const { data: settings = [], isLoading: loadingSettings } = useQuery({
    queryKey: ['event-settings'],
    queryFn: () => base44.entities.EventSettings.list(),
  });

  const eventSettings = settings[0] || {};
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['vendors'] });
  const refreshSettings = () => queryClient.invalidateQueries({ queryKey: ['event-settings'] });

  const handleMapUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingMap(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    if (eventSettings.id) {
      await base44.entities.EventSettings.update(eventSettings.id, { map_image_url: file_url });
    } else {
      await base44.entities.EventSettings.create({ event_name: 'イベント', map_image_url: file_url });
    }
    setUploadingMap(false);
    toast.success('マップ画像をアップロードしました');
    refreshSettings();
  };

  const handleSettingsUpdate = async (field, value) => {
    if (eventSettings.id) {
      await base44.entities.EventSettings.update(eventSettings.id, { [field]: value });
    } else {
      await base44.entities.EventSettings.create({ event_name: value, [field]: value });
    }
    refreshSettings();
  };

  if (loadingVendors || loadingSettings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const approvedCount = vendors.filter(v => v.is_approved).length;
  const placedCount = vendors.filter(v => v.is_placed).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-lg border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">運営管理画面</h1>
            <p className="text-sm text-muted-foreground">{eventSettings.event_name || 'イベント'}</p>
          </div>
          <div className="flex items-center gap-4">
            <a href="/" className="text-sm text-primary hover:underline">公開マップ →</a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{vendors.length}</p>
                <p className="text-xs text-muted-foreground">出店者数</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approvedCount}</p>
                <p className="text-xs text-muted-foreground">承認済み</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{placedCount}</p>
                <p className="text-xs text-muted-foreground">マップ配置済</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                <Users className="w-5 h-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{vendors.filter(v => v.is_active).length}</p>
                <p className="text-xs text-muted-foreground">有効アカウント</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="vendors">
          <TabsList className="bg-muted">
            <TabsTrigger value="vendors">出店者管理</TabsTrigger>
            <TabsTrigger value="approval">承認管理</TabsTrigger>
            <TabsTrigger value="map">マップ編集</TabsTrigger>
            <TabsTrigger value="settings">設定</TabsTrigger>
          </TabsList>

          <TabsContent value="vendors" className="mt-4">
            <VendorLoginTable vendors={vendors} onRefresh={refresh} />
          </TabsContent>

          <TabsContent value="approval" className="mt-4">
            <VendorApprovalList vendors={vendors} onRefresh={refresh} />
          </TabsContent>

          <TabsContent value="map" className="mt-4">
            <MapEditor
              vendors={vendors}
              mapImageUrl={eventSettings.map_image_url}
              onRefresh={refresh}
              onMapUpload={handleMapUpload}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <Card>
              <CardHeader><CardTitle>イベント設定</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>イベント名</Label>
                  <Input
                    defaultValue={eventSettings.event_name || ''}
                    onBlur={(e) => handleSettingsUpdate('event_name', e.target.value)}
                    placeholder="イベント名を入力"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>開催日</Label>
                    <Input
                      type="date"
                      defaultValue={eventSettings.event_date || ''}
                      onChange={(e) => handleSettingsUpdate('event_date', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>開始時間</Label>
                    <Input
                      type="time"
                      defaultValue={eventSettings.event_start_time || ''}
                      onChange={(e) => handleSettingsUpdate('event_start_time', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>マップ画像</Label>
                  <div className="mt-2">
                    {eventSettings.map_image_url && (
                      <img src={eventSettings.map_image_url} alt="Map" className="w-full max-w-md rounded-xl border mb-3" />
                    )}
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={handleMapUpload} />
                      <Button variant="outline" asChild disabled={uploadingMap}>
                        <span>
                          {uploadingMap ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                          {eventSettings.map_image_url ? '画像を変更' : '画像をアップロード'}
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Vendor service settings */}
            <Card className="mt-4">
              <CardHeader><CardTitle>店舗パラメータ設定</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">各店舗のAI待ち時間算出に使用するパラメータ</p>
                <div className="space-y-3">
                  {vendors.map(vendor => (
                    <div key={vendor.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                      <span className="font-medium min-w-[120px]">{vendor.store_name || vendor.login_id}</span>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">処理時間(分)</Label>
                        <Input
                          type="number" min="1" step="1"
                          defaultValue={vendor.avg_service_time || 5}
                          className="w-20 h-8"
                          onBlur={(e) => base44.entities.Vendor.update(vendor.id, { avg_service_time: parseInt(e.target.value) || 5 }).then(refresh)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">収容人数</Label>
                        <Input
                          type="number" min="1" step="1"
                          defaultValue={vendor.capacity || 1}
                          className="w-20 h-8"
                          onBlur={(e) => base44.entities.Vendor.update(vendor.id, { capacity: parseInt(e.target.value) || 1 }).then(refresh)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}