import { useState, useRef, useEffect, useCallback } from "react";
import { Volume2, Pause, Play } from "lucide-react";

interface TtsPlayerProps {
    audioUrl: string;
}

/**
 * Compact inline audio player for TTS playback on assistant messages.
 */
export function TtsPlayer({ audioUrl }: TtsPlayerProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        const audio = new Audio(audioUrl);
        audio.playbackRate = 1.1;
        audioRef.current = audio;

        const onTimeUpdate = () => {
            if (audio.duration) {
                setProgress((audio.currentTime / audio.duration) * 100);
            }
        };
        const onLoadedMetadata = () => setDuration(audio.duration);
        const onEnded = () => {
            setIsPlaying(false);
            setProgress(0);
        };

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("loadedmetadata", onLoadedMetadata);
        audio.addEventListener("ended", onEnded);

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("ended", onEnded);
            audio.pause();
            audio.src = "";
        };
    }, [audioUrl]);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            audio.play().catch((err) => console.warn("Playback blocked:", err));
            setIsPlaying(true);
        }
    }, [isPlaying]);

    const handleSeek = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const audio = audioRef.current;
            if (!audio || !audio.duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audio.currentTime = ratio * audio.duration;
        },
        [],
    );

    const formatTime = (seconds: number): string => {
        if (!seconds || !isFinite(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    return (
        <div
            className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5"
            style={{ background: "rgba(var(--color-primary-rgb, 99 102 241), 0.08)" }}
        >
            <button
                onClick={togglePlay}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
                style={{
                    background: "var(--a2ui-primary, var(--color-primary))",
                    color: "#fff",
                }}
                title={isPlaying ? "Pause" : "Play"}
            >
                {isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
            </button>

            {/* seekable progress bar */}
            <div
                className="relative h-1.5 flex-1 cursor-pointer rounded-full"
                style={{ background: "rgba(var(--color-primary-rgb, 99 102 241), 0.18)" }}
                onClick={handleSeek}
            >
                <div
                    className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-150"
                    style={{
                        width: `${progress}%`,
                        background: "var(--a2ui-primary, var(--color-primary))",
                    }}
                />
            </div>

            <span
                className="shrink-0 text-[10px] tabular-nums"
                style={{ color: "var(--color-text-muted)" }}
            >
                {formatTime(duration)}
            </span>

            <Volume2 size={13} style={{ color: "var(--color-text-muted)" }} />
        </div>
    );
}
