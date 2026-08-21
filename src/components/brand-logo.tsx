import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/brand/nexanotion-logo.png"
      alt="NexaNotion"
      width={1125}
      height={620}
      priority={priority}
      className={cn("h-auto w-full", className)}
    />
  );
}
