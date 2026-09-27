/**
 * Icônes de l'interface — jeu du kit de marque Sama Agent (07-icones-ui) :
 * Lucide, trait 1,5, `currentColor`. Les noms exportés restent ceux de l'app ;
 * chaque icône pointe vers son équivalent Lucide du kit.
 */
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  Compass,
  Ellipsis,
  FileText,
  Flag,
  History,
  House,
  Info,
  Landmark,
  ListChecks,
  LogOut,
  Mail,
  MessageSquare,
  Mic as LucideMic,
  Moon,
  Pause,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  Volume2,
  VolumeX,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";

type IconProps = { className?: string };

/** Trait 1,5 imposé par la charte ; décoratif (le libellé est porté par le parent). */
function brand(Icon: LucideIcon) {
  function BrandIcon({ className = "" }: IconProps) {
    return <Icon className={className} strokeWidth={1.5} aria-hidden focusable="false" />;
  }
  BrandIcon.displayName = `BrandIcon(${Icon.displayName ?? "Icon"})`;
  return BrandIcon;
}

export const Mic = brand(LucideMic);
export const CheckIcon = brand(Check);
export const AlertIcon = brand(TriangleAlert);
export const CloseIcon = brand(X);
export const ArrowRightIcon = brand(ArrowRight);
export const ArrowLeftIcon = brand(ArrowLeft);
export const UploadIcon = brand(Upload);
export const HomeIcon = brand(House);
export const ChatIcon = brand(MessageSquare);
export const MemoryIcon = brand(History);
export const FileIcon = brand(FileText);
export const ActionIcon = brand(ListChecks);
export const UserIcon = brand(User);
export const SearchIcon = brand(Search);
export const PlusIcon = brand(Plus);
export const SendIcon = brand(Send);
export const VolumeIcon = brand(Volume2);
export const VolumeOffIcon = brand(VolumeX);
export const InfoIcon = brand(Info);
export const SettingsIcon = brand(Settings);
export const MoreIcon = brand(Ellipsis);
export const PauseIcon = brand(Pause);
export const RefreshIcon = brand(RotateCcw);
export const TrashIcon = brand(Trash2);
export const ChevronRightIcon = brand(ChevronRight);
export const LogOutIcon = brand(LogOut);
export const CameraIcon = brand(Camera);
export const BuildingIcon = brand(Landmark);
export const CompassIcon = brand(Compass);
export const MailIcon = brand(Mail);
export const WifiOffIcon = brand(WifiOff);
export const FlagIcon = brand(Flag);
export const SunIcon = brand(Sun);
export const MoonIcon = brand(Moon);
