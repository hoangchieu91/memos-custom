import { type FC, useState } from "react";
import { MapPinIcon, LoaderIcon, PenToolIcon } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { useTranslate } from "@/utils/i18n";
import { validationService } from "../services";
import { useEditorContext } from "../state";
import { DrawioDialog } from "../components";
import InsertMenu from "../Toolbar/InsertMenu";
import VisibilitySelector from "../Toolbar/VisibilitySelector";
import type { EditorToolbarProps } from "../types";
import { NavigationIcon } from "lucide-react";

export const EditorToolbar: FC<EditorToolbarProps> = ({ onSave, onCancel, memoName, editorRef }) => {
  const t = useTranslate();
  const { state, actions, dispatch } = useEditorContext();
  const { valid } = validationService.canSave(state);

  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSmartCheckin, setIsSmartCheckin] = useState(false);
  const [isDrawioOpen, setIsDrawioOpen] = useState(false);

  const handleDrawioSave = (file: File) => {
    dispatch(actions.addLocalFile({
      file,
      previewUrl: URL.createObjectURL(file)
    }));
    toast.success("Đã đính kèm sơ đồ Draw.io thành công!");
  };

  const handleQuickLocation = () => {
    if (navigator.geolocation) {
      setIsGettingLocation(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setIsGettingLocation(false);
          const { latitude, longitude } = position.coords;
          const mapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
          const gpsText = `\n[GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}](${mapLink})\n`;
          if (editorRef && editorRef.current) {
             editorRef.current.insertText(gpsText);
          }
        },
        (error) => {
          setIsGettingLocation(false);
          let errorMessage = "Geolocation error";
          if (error.code === error.PERMISSION_DENIED) errorMessage = "Vui lòng cho phép quyền truy cập Vị trí.";
          toast.error(errorMessage);
          console.error("Geolocation error:", error);
        }
      );
    } else {
      toast.error("Trình duyệt không hỗ trợ Geolocation.");
    }
  };

  const handleSmartCheckin = () => {
    if (navigator.geolocation) {
      setIsSmartCheckin(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
            const data = await res.json();
            const address = data.display_name || "Vị trí không xác định";
            const mapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
            const checkinText = `#checkin 📍 Đang ở: ${address}\n[Google Maps](${mapLink})`;
            
            if (editorRef && editorRef.current) {
               editorRef.current.setContent(checkinText);
               // We set content and immediately dispatch state update so that validation passes
               dispatch(actions.updateContent(checkinText));
               
               // Use a tiny timeout to allow React state to settle before saving
               setTimeout(() => {
                 onSave();
                 setIsSmartCheckin(false);
               }, 100);
            }
          } catch (e) {
            console.error("Geocoding failed", e);
            toast.error("Không thể lấy địa chỉ từ tọa độ. Hãy thử lại!");
            setIsSmartCheckin(false);
          }
        },
        (error) => {
          setIsSmartCheckin(false);
          let errorMessage = "Geolocation error";
          if (error.code === error.PERMISSION_DENIED) errorMessage = "Vui lòng cho phép quyền truy cập Vị trí.";
          toast.error(errorMessage);
          console.error("Geolocation error:", error);
        }
      );
    } else {
      toast.error("Trình duyệt không hỗ trợ Geolocation.");
    }
  };


  const isSaving = state.ui.isLoading.saving;

  const handleLocationChange = (location: typeof state.metadata.location) => {
    dispatch(actions.setMetadata({ location }));
  };

  const handleToggleFocusMode = () => {
    dispatch(actions.toggleFocusMode());
  };

  const handleVisibilityChange = (visibility: typeof state.metadata.visibility) => {
    dispatch(actions.setMetadata({ visibility }));
  };

  return (
    <div className="w-full flex flex-row justify-between items-center mb-2">
      <div className="flex flex-row justify-start items-center gap-1">
        <InsertMenu
          isUploading={state.ui.isLoading.uploading}
          location={state.metadata.location}
          onLocationChange={handleLocationChange}
          onToggleFocusMode={handleToggleFocusMode}
          memoName={memoName}
        />
        <Button 
          variant="outline" 
          size="icon" 
          className="shadow-none border-0" 
          onClick={handleQuickLocation} 
          disabled={isGettingLocation || isSmartCheckin}
          title="Chèn tọa độ GPS (Gắn location thật)"
        >
          {isGettingLocation ? <LoaderIcon className="size-4 animate-spin text-gray-400" /> : <MapPinIcon className="size-4 text-emerald-600" />}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="shadow-none border-0 px-2 text-blue-600 bg-blue-50/50 hover:bg-blue-100" 
          onClick={handleSmartCheckin} 
          disabled={isGettingLocation || isSmartCheckin}
          title="Tự động Check-in và Đăng bài"
        >
          {isSmartCheckin ? <LoaderIcon className="size-4 animate-spin text-blue-400" /> : <NavigationIcon className="size-4 mr-1" />}
          <span className="hidden sm:inline">Check-in</span>
        </Button>
        <Button 
          variant="outline" 
          size="icon" 
          className="shadow-none border-0" 
          onClick={() => setIsDrawioOpen(true)}
          title="Vẽ sơ đồ tư duy (Draw.io)"
        >
          <PenToolIcon className="size-4 text-indigo-600" />
        </Button>
      </div>

      <div className="flex flex-row justify-end items-center gap-2">
        <VisibilitySelector value={state.metadata.visibility} onChange={handleVisibilityChange} />

        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
        )}

        <Button onClick={onSave} disabled={!valid || isSaving}>
          {isSaving ? t("editor.saving") : t("editor.save")}
        </Button>
      </div>

      <DrawioDialog 
        open={isDrawioOpen} 
        onOpenChange={setIsDrawioOpen} 
        onSave={handleDrawioSave} 
      />
    </div>
  );
};
