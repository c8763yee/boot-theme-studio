"use client";
/* eslint-disable @next/next/no-img-element */

import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { strToU8, zipSync } from "fflate";
import { GIFEncoder, applyPalette, quantize } from "gifenc";

type Locale = "zh-TW" | "en-US";
type Target = "grub2" | "systemd-boot";
type Scene = "menu" | "splash";
type LayerKind = "text" | "menu" | "image" | "video" | "label";

type Layer = {
  id: string;
  name: string;
  kind: LayerKind;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotation: number;
  visible: boolean;
  locked: boolean;
  text?: string;
  color?: string;
  background?: string;
  fontSize?: number;
  src?: string;
  file?: File;
};

type LoaderSettings = {
  defaultEntry: string;
  timeout: number;
  consoleMode: "auto" | "max" | "keep";
  editor: boolean;
};

const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 540;
const EXPORT_FPS = 8;
const EXPORT_SECONDS = 3;

const copy = {
  "zh-TW": {
    appName: "Boot Theme Studio",
    project: "未命名開機主題",
    saved: "素材只保存在這個瀏覽器工作階段",
    target: "輸出目標",
    scenes: "場景",
    menu: "開機選單",
    splash: "開機動畫",
    assets: "素材與元件",
    upload: "上傳圖片／影片",
    addText: "新增文字",
    addMenu: "新增選單",
    addLabel: "新增標籤",
    selected: "選取項目",
    layers: "圖層",
    noSelection: "選取畫布上的項目以調整屬性",
    position: "位置與尺寸",
    appearance: "外觀",
    content: "文字內容",
    opacity: "透明度",
    rotation: "旋轉",
    width: "寬度",
    height: "高度",
    delete: "刪除圖層",
    export: "匯出安裝套件",
    exporting: "正在建立 GIF 與安裝套件…",
    exportDone: "安裝套件已下載",
    exportFailed: "匯出失敗，請縮短影片或改用較小的素材。",
    preview: "即時預覽",
    resolution: "輸出解析度",
    undo: "復原",
    redo: "重做",
    language: "切換語言",
    systemdNote: "systemd-boot 使用韌體文字選單；自由排版會套用在 Plymouth 開機動畫。",
    loaderSettings: "systemd-boot 設定",
    defaultEntry: "預設項目",
    timeout: "等待秒數",
    consoleMode: "主控台模式",
    kernelEditor: "允許編輯核心參數",
    timeline: "動畫時間軸",
    play: "播放",
    pause: "暫停",
    framePolicy: "GRUB2 會使用目前時間點作為靜態畫面",
    unsupported: "此場景不支援自由排版",
    localProcessing: "本機處理",
    localDetail: "素材不會離開你的裝置",
    hide: "隱藏",
    show: "顯示",
    lock: "鎖定",
    unlock: "解除鎖定",
    emptyLayer: "尚未加入素材",
  },
  "en-US": {
    appName: "Boot Theme Studio",
    project: "Untitled boot theme",
    saved: "Assets stay in this browser session",
    target: "Export target",
    scenes: "Scenes",
    menu: "Boot menu",
    splash: "Boot splash",
    assets: "Assets & components",
    upload: "Upload image / video",
    addText: "Add text",
    addMenu: "Add menu",
    addLabel: "Add label",
    selected: "Selection",
    layers: "Layers",
    noSelection: "Select an item on the canvas to edit it",
    position: "Position & size",
    appearance: "Appearance",
    content: "Text content",
    opacity: "Opacity",
    rotation: "Rotation",
    width: "Width",
    height: "Height",
    delete: "Delete layer",
    export: "Export installer package",
    exporting: "Building GIF and installer package…",
    exportDone: "Installer package downloaded",
    exportFailed: "Export failed. Try a shorter video or smaller asset.",
    preview: "Live preview",
    resolution: "Output resolution",
    undo: "Undo",
    redo: "Redo",
    language: "Switch language",
    systemdNote: "systemd-boot uses a firmware text menu. Free positioning is applied to the Plymouth splash.",
    loaderSettings: "systemd-boot settings",
    defaultEntry: "Default entry",
    timeout: "Timeout",
    consoleMode: "Console mode",
    kernelEditor: "Allow kernel command-line editing",
    timeline: "Animation timeline",
    play: "Play",
    pause: "Pause",
    framePolicy: "GRUB2 uses the current time as its still poster frame",
    unsupported: "Free positioning is unavailable in this scene",
    localProcessing: "Local processing",
    localDetail: "Your assets never leave this device",
    hide: "Hide",
    show: "Show",
    lock: "Lock",
    unlock: "Unlock",
    emptyLayer: "No assets yet",
  },
} as const;

const initialLayers: Layer[] = [
  {
    id: "eyebrow",
    name: "Section label",
    kind: "label",
    x: 74,
    y: 62,
    width: 240,
    height: 34,
    opacity: 1,
    rotation: 0,
    visible: true,
    locked: false,
    text: "BOOT MANAGER / 01",
    color: "#d9ff61",
    background: "rgba(217,255,97,.12)",
    fontSize: 13,
  },
  {
    id: "headline",
    name: "Heading",
    kind: "text",
    x: 72,
    y: 110,
    width: 620,
    height: 78,
    opacity: 1,
    rotation: 0,
    visible: true,
    locked: false,
    text: "Choose your system",
    color: "#f4f2ea",
    fontSize: 47,
  },
  {
    id: "boot-menu",
    name: "Boot entries",
    kind: "menu",
    x: 72,
    y: 224,
    width: 650,
    height: 205,
    opacity: 1,
    rotation: 0,
    visible: true,
    locked: false,
    color: "#f4f2ea",
    background: "rgba(7,12,22,.72)",
    fontSize: 16,
  },
  {
    id: "hint",
    name: "Keyboard hint",
    kind: "text",
    x: 72,
    y: 472,
    width: 530,
    height: 28,
    opacity: 0.68,
    rotation: 0,
    visible: true,
    locked: false,
    text: "↑ ↓  Navigate     ENTER  Select     E  Edit",
    color: "#d8d8d3",
    fontSize: 13,
  },
];

const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function safeSlug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "boot-theme"
  );
}

function download(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function waitForSeek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    if (!Number.isFinite(video.duration) || video.readyState < 2) {
      resolve();
      return;
    }
    const next = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.04));
    if (Math.abs(video.currentTime - next) < 0.025) {
      resolve();
      return;
    }
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = next;
    setTimeout(done, 500);
  });
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("zh-TW");
  const [target, setTarget] = useState<Target>("grub2");
  const [scene, setScene] = useState<Scene>("menu");
  const [projectName, setProjectName] = useState("Kinetic Boot");
  const [layers, setLayers] = useState<Layer[]>(initialLayers);
  const [splashLayers, setSplashLayers] = useState<Layer[]>([
    {
      id: "splash-label",
      name: "Splash title",
      kind: "text",
      x: 286,
      y: 228,
      width: 390,
      height: 62,
      opacity: 1,
      rotation: 0,
      visible: true,
      locked: false,
      text: "Starting Linux",
      color: "#f4f2ea",
      fontSize: 36,
    },
    {
      id: "splash-status",
      name: "Status label",
      kind: "label",
      x: 376,
      y: 314,
      width: 208,
      height: 34,
      opacity: 1,
      rotation: 0,
      visible: true,
      locked: false,
      text: "LOADING SYSTEM",
      color: "#d9ff61",
      background: "rgba(217,255,97,.12)",
      fontSize: 12,
    },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>("boot-menu");
  const [history, setHistory] = useState<Layer[][]>([]);
  const [future, setFuture] = useState<Layer[][]>([]);
  const [resolution, setResolution] = useState("960x540");
  const [zoom, setZoom] = useState(82);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState("");
  const [loader, setLoader] = useState<LoaderSettings>({
    defaultEntry: "linux.conf",
    timeout: 5,
    consoleMode: "max",
    editor: false,
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mediaRefs = useRef(new Map<string, HTMLImageElement | HTMLVideoElement>());
  const dragRef = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    layerX: number;
    layerY: number;
    width: number;
    height: number;
  } | null>(null);

  const t = copy[locale];
  const activeLayers = scene === "menu" ? layers : splashLayers;
  const setActiveLayers = scene === "menu" ? setLayers : setSplashLayers;
  const selected = activeLayers.find((layer) => layer.id === selectedId) ?? null;
  const editable = target === "grub2" || scene === "splash";

  const remember = useCallback(() => {
    setHistory((items) => [...items.slice(-39), activeLayers.map((layer) => ({ ...layer }))]);
    setFuture([]);
  }, [activeLayers]);

  const patchSelected = (patch: Partial<Layer>, rememberChange = true) => {
    if (!selectedId) return;
    if (rememberChange) remember();
    setActiveLayers((items) =>
      items.map((item) => (item.id === selectedId ? { ...item, ...patch } : item)),
    );
  };

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    remember();
    const removed = activeLayers.find((item) => item.id === selectedId);
    if (removed?.src) URL.revokeObjectURL(removed.src);
    setActiveLayers((items) => items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }, [activeLayers, remember, selectedId, setActiveLayers]);

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [activeLayers.map((layer) => ({ ...layer })), ...items]);
    setActiveLayers(previous);
    setHistory((items) => items.slice(0, -1));
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, activeLayers.map((layer) => ({ ...layer }))]);
    setActiveLayers(next);
    setFuture((items) => items.slice(1));
  };

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setPlayhead((value) => (value + 0.1) % EXPORT_SECONDS);
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    mediaRefs.current.forEach((element) => {
      if (element instanceof HTMLVideoElement) {
        if (playing) element.play().catch(() => undefined);
        else {
          element.pause();
          if (Number.isFinite(element.duration)) {
            element.currentTime = Math.min(playhead, Math.max(0, element.duration - 0.04));
          }
        }
      }
    });
  }, [playing, playhead]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!drag || !rect) return;
      const dx = ((event.clientX - drag.startX) * DESIGN_WIDTH) / rect.width;
      const dy = ((event.clientY - drag.startY) * DESIGN_HEIGHT) / rect.height;
      setActiveLayers((items) =>
        items.map((item) => {
          if (item.id !== drag.id) return item;
          if (drag.mode === "resize") {
            return {
              ...item,
              width: clamp(drag.width + dx, 48, DESIGN_WIDTH - item.x),
              height: clamp(drag.height + dy, 28, DESIGN_HEIGHT - item.y),
            };
          }
          return {
            ...item,
            x: clamp(drag.layerX + dx, 0, DESIGN_WIDTH - item.width),
            y: clamp(drag.layerY + dy, 0, DESIGN_HEIGHT - item.height),
          };
        }),
      );
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [setActiveLayers]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const targetElement = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(targetElement.tagName)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (!selected || selected.locked) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
        return;
      }
      const delta = event.shiftKey ? 10 : 1;
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-delta, 0],
        ArrowRight: [delta, 0],
        ArrowUp: [0, -delta],
        ArrowDown: [0, delta],
      };
      const move = directions[event.key];
      if (move) {
        event.preventDefault();
        patchSelected(
          {
            x: clamp(selected.x + move[0], 0, DESIGN_WIDTH - selected.width),
            y: clamp(selected.y + move[1], 0, DESIGN_HEIGHT - selected.height),
          },
          false,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const startDrag = (
    event: ReactPointerEvent,
    layer: Layer,
    mode: "move" | "resize" = "move",
  ) => {
    if (!editable || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(layer.id);
    remember();
    dragRef.current = {
      id: layer.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      layerX: layer.x,
      layerY: layer.y,
      width: layer.width,
      height: layer.height,
    };
  };

  const addLayer = (kind: "text" | "menu" | "label") => {
    remember();
    const id = uid();
    const base: Layer = {
      id,
      name: kind === "menu" ? "Boot entries" : kind === "label" ? "Label" : "Text",
      kind,
      x: 330,
      y: 210,
      width: kind === "menu" ? 420 : 300,
      height: kind === "menu" ? 190 : kind === "label" ? 34 : 54,
      opacity: 1,
      rotation: 0,
      visible: true,
      locked: false,
      text: kind === "label" ? "STATUS LABEL" : kind === "text" ? "New text" : undefined,
      color: kind === "label" ? "#d9ff61" : "#f4f2ea",
      background: kind === "label" ? "rgba(217,255,97,.12)" : "rgba(7,12,22,.72)",
      fontSize: kind === "label" ? 12 : 22,
    };
    setActiveLayers((items) => [...items, base]);
    setSelectedId(id);
  };

  const onFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    remember();
    const additions = files
      .filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"))
      .map((file, index): Layer => {
        const isVideo = file.type.startsWith("video/");
        return {
          id: uid(),
          name: file.name,
          kind: isVideo ? "video" : "image",
          x: 190 + index * 26,
          y: 120 + index * 22,
          width: 420,
          height: 236,
          opacity: 1,
          rotation: 0,
          visible: true,
          locked: false,
          src: URL.createObjectURL(file),
          file,
        };
      });
    if (additions.length) {
      setActiveLayers((items) => [...items, ...additions]);
      setSelectedId(additions.at(-1)?.id ?? null);
    }
    event.target.value = "";
  };

  const setMediaRef = (id: string, element: HTMLImageElement | HTMLVideoElement | null) => {
    if (element) mediaRefs.current.set(id, element);
    else mediaRefs.current.delete(id);
  };

  const drawScene = async (canvas: HTMLCanvasElement, time: number) => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is unavailable");
    const scaleX = canvas.width / DESIGN_WIDTH;
    const scaleY = canvas.height / DESIGN_HEIGHT;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#14263a");
    gradient.addColorStop(0.58, "#09121f");
    gradient.addColorStop(1, "#050911");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(217,255,97,.08)";
    ctx.beginPath();
    ctx.arc(canvas.width * 0.82, canvas.height * 0.18, canvas.width * 0.18, 0, Math.PI * 2);
    ctx.fill();

    const drawLayers = scene === "menu" ? layers : splashLayers;
    for (const layer of drawLayers.filter((item) => item.visible)) {
      const x = layer.x * scaleX;
      const y = layer.y * scaleY;
      const width = layer.width * scaleX;
      const height = layer.height * scaleY;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.translate(x + width / 2, y + height / 2);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      if (layer.kind === "image" || layer.kind === "video") {
        const media = mediaRefs.current.get(layer.id);
        if (media instanceof HTMLVideoElement) {
          await waitForSeek(media, Number.isFinite(media.duration) ? time % media.duration : 0);
        }
        if (media && (media instanceof HTMLVideoElement || media.complete)) {
          ctx.drawImage(media, -width / 2, -height / 2, width, height);
        }
      } else if (layer.kind === "menu") {
        ctx.fillStyle = layer.background ?? "rgba(7,12,22,.72)";
        ctx.fillRect(-width / 2, -height / 2, width, height);
        const entries = ["Linux 6.12 — main", "Linux 6.12 — fallback", "Windows Boot Manager"];
        entries.forEach((entry, index) => {
          const rowY = -height / 2 + 18 * scaleY + index * 54 * scaleY;
          if (index === 0) {
            ctx.fillStyle = "#d9ff61";
            ctx.fillRect(-width / 2 + 10 * scaleX, rowY, width - 20 * scaleX, 40 * scaleY);
            ctx.fillStyle = "#11180d";
          } else ctx.fillStyle = layer.color ?? "#f4f2ea";
          ctx.font = `${Math.round((layer.fontSize ?? 16) * scaleY)}px ui-monospace, monospace`;
          ctx.textBaseline = "middle";
          ctx.fillText(entry, -width / 2 + 26 * scaleX, rowY + 20 * scaleY);
        });
      } else {
        if (layer.background) {
          ctx.fillStyle = layer.background;
          ctx.fillRect(-width / 2, -height / 2, width, height);
        }
        ctx.fillStyle = layer.color ?? "#f4f2ea";
        ctx.font = `${layer.kind === "label" ? 600 : 500} ${Math.round(
          (layer.fontSize ?? 20) * scaleY,
        )}px ui-sans-serif, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(layer.text ?? "", -width / 2 + (layer.kind === "label" ? 14 : 0) * scaleX, 0);
      }
      ctx.restore();
    }
  };

  const makeInstaller = (slug: string) => {
    const targetValue = target;
    return `#!/usr/bin/env bash
set -Eeuo pipefail

THEME_ID="${slug}"
TARGET="${targetValue}"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BACKUP_DIR="/var/lib/boot-theme-studio/backups/$(date +%Y%m%d-%H%M%S)"

if [[ "${"${EUID}"}" -ne 0 ]]; then
  echo "Run with sudo: sudo ./install.sh"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

install_grub() {
  local grub_root config output
  if [[ -d /boot/grub2 ]]; then grub_root=/boot/grub2; else grub_root=/boot/grub; fi
  config=/etc/default/grub
  mkdir -p "$grub_root/themes/$THEME_ID"
  cp -a "$ROOT_DIR/grub2/." "$grub_root/themes/$THEME_ID/"
  cp -a "$config" "$BACKUP_DIR/grub.default" 2>/dev/null || true
  sed -i '/^GRUB_THEME=/d' "$config"
  printf '\nGRUB_THEME="%s/themes/%s/theme.txt"\n' "$grub_root" "$THEME_ID" >> "$config"
  if command -v update-grub >/dev/null; then
    update-grub
  elif command -v grub2-mkconfig >/dev/null; then
    output=/boot/grub2/grub.cfg; grub2-mkconfig -o "$output"
  else
    output=/boot/grub/grub.cfg; grub-mkconfig -o "$output"
  fi
}

install_systemd_boot() {
  local esp loader_conf
  command -v bootctl >/dev/null || { echo "systemd-boot is not installed"; exit 1; }
  esp="$(bootctl --print-esp-path)"
  loader_conf="$esp/loader/loader.conf"
  mkdir -p "$esp/loader"
  cp -a "$loader_conf" "$BACKUP_DIR/loader.conf" 2>/dev/null || true
  cp "$ROOT_DIR/systemd-boot/loader.conf" "$loader_conf"
  if command -v plymouth-set-default-theme >/dev/null; then
    mkdir -p "/usr/share/plymouth/themes/$THEME_ID"
    cp -a "$ROOT_DIR/plymouth/." "/usr/share/plymouth/themes/$THEME_ID/"
    plymouth-set-default-theme "$THEME_ID"
    if command -v update-initramfs >/dev/null; then update-initramfs -u
    elif command -v dracut >/dev/null; then dracut -f
    elif command -v mkinitcpio >/dev/null; then mkinitcpio -P
    fi
  else
    echo "Plymouth is not installed; loader settings were applied without animation."
  fi
}

case "$TARGET" in
  grub2) install_grub ;;
  systemd-boot) install_systemd_boot ;;
  *) echo "Unsupported target: $TARGET"; exit 1 ;;
esac

printf '%s\n' "$BACKUP_DIR" > /var/lib/boot-theme-studio/latest-backup
echo "Installed $THEME_ID for $TARGET. Backup: $BACKUP_DIR"
`;
  };

  const exportPackage = async () => {
    setExporting(true);
    setToast("");
    const wasPlaying = playing;
    setPlaying(false);
    try {
      const [width, height] = resolution.split("x").map(Number);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const gif = GIFEncoder();
      const hasVideo = activeLayers.some((layer) => layer.kind === "video" && layer.visible);
      const frameCount = hasVideo ? EXPORT_FPS * EXPORT_SECONDS : 1;
      const pngFrames: Uint8Array[] = [];
      let poster = new Uint8Array();

      for (let frame = 0; frame < frameCount; frame += 1) {
        await drawScene(canvas, frame / EXPORT_FPS);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas is unavailable");
        const pixels = ctx.getImageData(0, 0, width, height).data;
        const palette = quantize(pixels, 256);
        const indexed = applyPalette(pixels, palette);
        gif.writeFrame(indexed, width, height, {
          palette,
          delay: Math.round(1000 / EXPORT_FPS),
          repeat: 0,
        });
        const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!pngBlob) throw new Error("PNG encoding failed");
        const png = new Uint8Array(await pngBlob.arrayBuffer());
        pngFrames.push(png);
        if (frame === Math.min(frameCount - 1, Math.round(playhead * EXPORT_FPS))) poster = png;
      }
      if (!poster.length) poster = pngFrames[0];
      gif.finish();
      const gifBytes = gif.bytes();
      const slug = safeSlug(projectName);
      const currentLayers = activeLayers.map((layer) => ({
        ...layer,
        file: undefined,
        src: undefined,
        asset: layer.file ? `assets/${layer.file.name}` : undefined,
      }));
      const project = {
        schemaVersion: 1,
        name: projectName,
        target,
        scene,
        resolution: { width, height },
        frameRate: EXPORT_FPS,
        durationMs: frameCount === 1 ? 0 : EXPORT_SECONDS * 1000,
        loader,
        layers: currentLayers,
      };
      const archive: Record<string, Uint8Array> = {
        "manifest.json": strToU8(JSON.stringify({ id: slug, ...project }, null, 2)),
        "source/project.json": strToU8(JSON.stringify(project, null, 2)),
        "source/composed-animation.gif": gifBytes,
        "install.sh": strToU8(makeInstaller(slug)),
        "uninstall.sh": strToU8(`#!/usr/bin/env bash\nset -Eeuo pipefail\nBACKUP_FILE=/var/lib/boot-theme-studio/latest-backup\n[[ -f "$BACKUP_FILE" ]] || { echo "No backup found"; exit 1; }\necho "Backup retained at: $(cat "$BACKUP_FILE")"\necho "Restore the listed files after reviewing them."\n`),
        "README.zh-TW.md": strToU8(`# ${projectName}\n\n執行 \`sudo ./install.sh\` 安裝。套件目標為 ${target}。安裝前會備份原設定。\n\nGRUB2 使用 poster.png；systemd-boot 使用文字選單，動畫由 Plymouth 播放。\n`),
        "README.en-US.md": strToU8(`# ${projectName}\n\nRun \`sudo ./install.sh\` to install this ${target} package. Existing configuration is backed up first.\n\nGRUB2 uses poster.png; systemd-boot keeps its text menu and Plymouth plays the animation.\n`),
      };
      activeLayers.forEach((layer) => {
        if (layer.file) {
          // Filled below after reading the user-selected file.
          archive[`assets/${layer.file.name}`] = new Uint8Array();
        }
      });
      for (const layer of activeLayers) {
        if (layer.file) archive[`assets/${layer.file.name}`] = new Uint8Array(await layer.file.arrayBuffer());
      }
      if (target === "grub2") {
        archive["grub2/poster.png"] = poster;
        archive["grub2/theme.txt"] = strToU8(`title-text: ""\ndesktop-image: "poster.png"\ndesktop-color: "#07101d"\n+ boot_menu {\n  left = 7.5%\n  top = 41%\n  width = 68%\n  height = 38%\n  item_color = "#f4f2ea"\n  selected_item_color = "#10160c"\n  selected_item_pixmap_style = "select_*.png"\n}\n+ label {\n  text = "Enter: boot   E: edit"\n  left = 8%\n  top = 91%\n  color = "#b7bbb5"\n}\n`);
        archive["grub2/select_c.png"] = poster;
      } else {
        archive["systemd-boot/loader.conf"] = strToU8(`default ${loader.defaultEntry}\ntimeout ${loader.timeout}\nconsole-mode ${loader.consoleMode}\neditor ${loader.editor ? "yes" : "no"}\n`);
        archive[`plymouth/${slug}.plymouth`] = strToU8(`[Plymouth Theme]\nName=${projectName}\nDescription=Generated by Boot Theme Studio\nModuleName=script\n\n[script]\nImageDir=/usr/share/plymouth/themes/${slug}\nScriptFile=/usr/share/plymouth/themes/${slug}/${slug}.script\n`);
        archive[`plymouth/${slug}.script`] = strToU8(`frame_count = ${frameCount};\nframe = 0;\nsprite = Sprite();\nfun refresh_callback () {\n  name = "frames/frame-" + Math.Int(frame) + ".png";\n  sprite.SetImage(Image(name));\n  sprite.SetX(Window.GetWidth() / 2 - sprite.GetImage().GetWidth() / 2);\n  sprite.SetY(Window.GetHeight() / 2 - sprite.GetImage().GetHeight() / 2);\n  frame = (frame + 1) % frame_count;\n}\nPlymouth.SetRefreshFunction(refresh_callback);\n`);
        pngFrames.forEach((frame, index) => {
          archive[`plymouth/frames/frame-${index}.png`] = frame;
        });
      }
      const zipped = zipSync(archive, { level: 6 });
      download(zipped, `${slug}-${target}.zip`);
      setToast(t.exportDone);
    } catch (error) {
      console.error(error);
      setToast(t.exportFailed);
    } finally {
      setExporting(false);
      setPlaying(wasPlaying);
    }
  };

  const systemdEntries = useMemo(
    () => ["Linux 6.12 — main", "Linux 6.12 — fallback", "Windows Boot Manager", "Reboot Into Firmware Interface"],
    [],
  );

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div>
            <div className="brand-name">{t.appName}</div>
            <input
              className="project-name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              aria-label={locale === "zh-TW" ? "專案名稱" : "Project name"}
            />
          </div>
        </div>

        <div className="toolbar-actions">
          <div className="privacy-chip"><span className="status-dot" /> <strong>{t.localProcessing}</strong><small>{t.localDetail}</small></div>
          <button className="icon-button" onClick={undo} disabled={!history.length} title={t.undo} aria-label={t.undo}>↶</button>
          <button className="icon-button" onClick={redo} disabled={!future.length} title={t.redo} aria-label={t.redo}>↷</button>
          <select value={resolution} onChange={(event) => setResolution(event.target.value)} aria-label={t.resolution}>
            <option value="960x540">960 × 540</option>
            <option value="1280x720">1280 × 720</option>
            <option value="1920x1080">1920 × 1080</option>
          </select>
          <button className="locale-button" onClick={() => setLocale(locale === "zh-TW" ? "en-US" : "zh-TW")} aria-label={t.language}>
            {locale === "zh-TW" ? "繁中" : "EN"}
          </button>
          <button className="export-button" onClick={exportPackage} disabled={exporting}>
            <span aria-hidden="true">↓</span>{exporting ? t.exporting : t.export}
          </button>
        </div>
      </header>

      <section className="studio-grid">
        <aside className="left-panel panel">
          <div className="panel-section">
            <div className="section-kicker">01 / {t.target}</div>
            <div className="segmented target-switch">
              <button className={target === "grub2" ? "active" : ""} onClick={() => setTarget("grub2")}><span className="target-icon">G</span>GRUB2</button>
              <button className={target === "systemd-boot" ? "active" : ""} onClick={() => setTarget("systemd-boot")}><span className="target-icon">S</span>systemd-boot</button>
            </div>
          </div>

          <div className="panel-section">
            <div className="section-kicker">02 / {t.scenes}</div>
            <div className="scene-list">
              <button className={scene === "menu" ? "active" : ""} onClick={() => { setScene("menu"); setSelectedId(null); }}><span className="scene-glyph">▤</span><span>{t.menu}<small>{target === "grub2" ? "GRUB theme.txt" : "loader.conf"}</small></span><b>›</b></button>
              <button className={scene === "splash" ? "active" : ""} onClick={() => { setScene("splash"); setSelectedId(null); }}><span className="scene-glyph">◉</span><span>{t.splash}<small>{target === "grub2" ? "Poster frame" : "Plymouth"}</small></span><b>›</b></button>
            </div>
          </div>

          <div className="panel-section grow">
            <div className="section-kicker">03 / {t.assets}</div>
            <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={onFiles} />
            <button className="upload-zone" onClick={() => fileInput.current?.click()} disabled={!editable}>
              <span className="upload-plus">＋</span><strong>{t.upload}</strong><small>PNG · JPG · GIF · MP4 · WebM</small>
            </button>
            <div className="component-grid">
              <button onClick={() => addLayer("text")} disabled={!editable}><span>T</span>{t.addText}</button>
              <button onClick={() => addLayer("menu")} disabled={!editable}><span>☷</span>{t.addMenu}</button>
              <button onClick={() => addLayer("label")} disabled={!editable}><span>▱</span>{t.addLabel}</button>
            </div>
            {!editable && <p className="target-warning">{t.systemdNote}</p>}
          </div>

          <div className="storage-note"><span>⌁</span><div><strong>{t.localProcessing}</strong><small>{t.saved}</small></div></div>
        </aside>

        <section className="workspace">
          <div className="canvas-toolbar">
            <div><span className="live-dot" />{t.preview}<b>{target === "grub2" ? "GRUB2" : scene === "menu" ? "UEFI CONSOLE" : "PLYMOUTH"}</b></div>
            <div className="zoom-control"><button onClick={() => setZoom((value) => Math.max(35, value - 10))}>−</button><span>{zoom}%</span><button onClick={() => setZoom((value) => Math.min(120, value + 10))}>＋</button></div>
          </div>

          <div className="canvas-stage" onPointerDown={() => setSelectedId(null)}>
            <div className="ruler ruler-top" /><div className="ruler ruler-left" />
            <div
              ref={canvasRef}
              className={`boot-canvas ${!editable ? "read-only" : ""}`}
              style={{ width: `${zoom}%` }}
            >
              <div className="canvas-orb" />
              {target === "systemd-boot" && scene === "menu" ? (
                <div className="systemd-preview">
                  <div className="firmware-title">Linux Boot Manager</div>
                  <div className="firmware-entries">
                    {systemdEntries.map((entry, index) => <div className={index === 0 ? "selected" : ""} key={entry}>{entry}</div>)}
                  </div>
                  <div className="firmware-hint">Use ↑ and ↓ to change selection. Press Enter to boot.</div>
                  <div className="unsupported-badge">{t.unsupported}</div>
                </div>
              ) : (
                activeLayers.map((layer) => (
                  <div
                    key={layer.id}
                    className={`canvas-layer ${layer.kind} ${selectedId === layer.id ? "selected" : ""} ${layer.locked ? "locked" : ""}`}
                    style={{
                      left: `${(layer.x / DESIGN_WIDTH) * 100}%`,
                      top: `${(layer.y / DESIGN_HEIGHT) * 100}%`,
                      width: `${(layer.width / DESIGN_WIDTH) * 100}%`,
                      height: `${(layer.height / DESIGN_HEIGHT) * 100}%`,
                      opacity: layer.visible ? layer.opacity : 0,
                      transform: `rotate(${layer.rotation}deg)`,
                      color: layer.color,
                      background: layer.background,
                      fontSize: `${((layer.fontSize ?? 16) / DESIGN_HEIGHT) * 100}cqw`,
                      pointerEvents: layer.visible ? "auto" : "none",
                    }}
                    onPointerDown={(event) => startDrag(event, layer)}
                  >
                    {layer.kind === "text" || layer.kind === "label" ? layer.text : null}
                    {layer.kind === "menu" && (
                      <div className="boot-entry-list">
                        <div className="active"><span>01</span>Linux 6.12 — main<b>↵</b></div>
                        <div><span>02</span>Linux 6.12 — fallback</div>
                        <div><span>03</span>Windows Boot Manager</div>
                      </div>
                    )}
                    {layer.kind === "image" && layer.src && <img ref={(element) => setMediaRef(layer.id, element)} src={layer.src} alt="" draggable={false} />}
                    {layer.kind === "video" && layer.src && <video ref={(element) => setMediaRef(layer.id, element)} src={layer.src} autoPlay muted loop playsInline />}
                    {selectedId === layer.id && !layer.locked && <button className="resize-handle" aria-label="Resize" onPointerDown={(event) => startDrag(event, layer, "resize")} />}
                  </div>
                ))
              )}
              <div className="safe-area" />
            </div>
          </div>

          <div className="timeline-bar">
            <button className="play-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? t.pause : t.play}>{playing ? "Ⅱ" : "▶"}</button>
            <div className="timeline-main"><div className="timeline-label"><span>{t.timeline}</span><b>{playhead.toFixed(1)}s / {EXPORT_SECONDS.toFixed(1)}s</b></div><input type="range" min="0" max={EXPORT_SECONDS} step="0.1" value={playhead} onChange={(event) => { setPlaying(false); setPlayhead(Number(event.target.value)); }} /></div>
            <div className="poster-policy"><span>◆</span>{t.framePolicy}</div>
          </div>
        </section>

        <aside className="right-panel panel">
          {target === "systemd-boot" && scene === "menu" ? (
            <div className="inspector">
              <div className="inspector-title"><div><span>04</span><strong>{t.loaderSettings}</strong></div><span className="type-pill">CONF</span></div>
              <label>{t.defaultEntry}<select value={loader.defaultEntry} onChange={(event) => setLoader({ ...loader, defaultEntry: event.target.value })}><option value="linux.conf">linux.conf</option><option value="linux-fallback.conf">linux-fallback.conf</option><option value="@saved">@saved</option></select></label>
              <label>{t.timeout}<div className="number-unit"><input type="number" min="0" max="30" value={loader.timeout} onChange={(event) => setLoader({ ...loader, timeout: Number(event.target.value) })} /><span>s</span></div></label>
              <label>{t.consoleMode}<select value={loader.consoleMode} onChange={(event) => setLoader({ ...loader, consoleMode: event.target.value as LoaderSettings["consoleMode"] })}><option value="max">max</option><option value="auto">auto</option><option value="keep">keep</option></select></label>
              <label className="toggle-row"><span>{t.kernelEditor}</span><button className={loader.editor ? "toggle active" : "toggle"} onClick={() => setLoader({ ...loader, editor: !loader.editor })}><i /></button></label>
              <div className="config-preview"><code>default {loader.defaultEntry}<br />timeout {loader.timeout}<br />console-mode {loader.consoleMode}<br />editor {loader.editor ? "yes" : "no"}</code></div>
            </div>
          ) : (
            <div className="inspector">
              <div className="inspector-title"><div><span>04</span><strong>{t.selected}</strong></div>{selected && <span className="type-pill">{selected.kind.toUpperCase()}</span>}</div>
              {!selected ? <div className="empty-inspector"><span>⌖</span><p>{t.noSelection}</p></div> : (
                <>
                  <label>{locale === "zh-TW" ? "圖層名稱" : "Layer name"}<input value={selected.name} onChange={(event) => patchSelected({ name: event.target.value }, false)} /></label>
                  {(selected.kind === "text" || selected.kind === "label") && <label>{t.content}<textarea value={selected.text} onChange={(event) => patchSelected({ text: event.target.value }, false)} /></label>}
                  <div className="subsection-title">{t.position}</div>
                  <div className="property-grid"><label>X<input type="number" value={Math.round(selected.x)} onChange={(event) => patchSelected({ x: Number(event.target.value) }, false)} /></label><label>Y<input type="number" value={Math.round(selected.y)} onChange={(event) => patchSelected({ y: Number(event.target.value) }, false)} /></label><label>{t.width}<input type="number" value={Math.round(selected.width)} onChange={(event) => patchSelected({ width: Number(event.target.value) }, false)} /></label><label>{t.height}<input type="number" value={Math.round(selected.height)} onChange={(event) => patchSelected({ height: Number(event.target.value) }, false)} /></label></div>
                  <div className="subsection-title">{t.appearance}</div>
                  <label className="range-label"><span>{t.opacity}<b>{Math.round(selected.opacity * 100)}%</b></span><input type="range" min="0" max="1" step="0.01" value={selected.opacity} onChange={(event) => patchSelected({ opacity: Number(event.target.value) }, false)} /></label>
                  <label className="range-label"><span>{t.rotation}<b>{selected.rotation}°</b></span><input type="range" min="-180" max="180" value={selected.rotation} onChange={(event) => patchSelected({ rotation: Number(event.target.value) }, false)} /></label>
                  {(selected.kind === "text" || selected.kind === "label" || selected.kind === "menu") && <div className="color-row"><label>{locale === "zh-TW" ? "文字色彩" : "Text color"}<input type="color" value={selected.color?.startsWith("#") ? selected.color : "#f4f2ea"} onChange={(event) => patchSelected({ color: event.target.value }, false)} /></label><label>{locale === "zh-TW" ? "字級" : "Font size"}<input type="number" value={selected.fontSize} onChange={(event) => patchSelected({ fontSize: Number(event.target.value) }, false)} /></label></div>}
                  <button className="danger-button" onClick={removeSelected}>{t.delete}</button>
                </>
              )}
            </div>
          )}

          <div className="layer-stack">
            <div className="layer-heading"><span>05 / {t.layers}</span><b>{activeLayers.length}</b></div>
            <div className="layer-items">
              {[...activeLayers].reverse().map((layer) => (
                <button key={layer.id} className={selectedId === layer.id ? "active" : ""} onClick={() => setSelectedId(layer.id)}>
                  <span className="layer-kind">{layer.kind === "text" ? "T" : layer.kind === "video" ? "▶" : layer.kind === "image" ? "▧" : layer.kind === "menu" ? "☷" : "L"}</span>
                  <span className="layer-name">{layer.name}<small>{Math.round(layer.width)} × {Math.round(layer.height)}</small></span>
                  <span className="layer-actions"><i onClick={(event) => { event.stopPropagation(); setActiveLayers((items) => items.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item)); }} title={layer.visible ? t.hide : t.show}>{layer.visible ? "◉" : "○"}</i><i onClick={(event) => { event.stopPropagation(); setActiveLayers((items) => items.map((item) => item.id === layer.id ? { ...item, locked: !item.locked } : item)); }} title={layer.locked ? t.unlock : t.lock}>{layer.locked ? "◆" : "◇"}</i></span>
                </button>
              ))}
              {!activeLayers.length && <div className="empty-layers">{t.emptyLayer}</div>}
            </div>
          </div>
        </aside>
      </section>

      {toast && <div className="toast" role="status"><span className={toast === t.exportDone ? "success" : "error"} />{toast}<button onClick={() => setToast("")}>×</button></div>}
    </main>
  );
}
