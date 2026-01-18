import { ExternalLink } from "lucide-react";

interface WoodWideAttributionProps {
  variant?: "badge" | "inline" | "footer";
  showIcon?: boolean;
}

export function WoodWideAttribution({ 
  variant = "badge", 
  showIcon = true 
}: WoodWideAttributionProps) {
  if (variant === "footer") {
    return (
      <a
        href="https://docs.woodwide.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
      >
        Wood Wide AI
        {showIcon && <ExternalLink className="h-3 w-3" />}
      </a>
    );
  }

  if (variant === "inline") {
    return (
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
        Powered by{" "}
        <a
          href="https://docs.woodwide.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:underline inline-flex items-center gap-0.5"
        >
          Wood Wide AI
          {showIcon && <ExternalLink className="h-3 w-3" />}
        </a>
      </span>
    );
  }

  // badge variant (default)
  return (
    <a
      href="https://docs.woodwide.ai"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
        <polyline points="7.5 19.79 7.5 14.6 3 12" />
        <polyline points="21 12 16.5 14.6 16.5 19.79" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
      Powered by Wood Wide AI
      {showIcon && <ExternalLink className="h-3 w-3" />}
    </a>
  );
}
