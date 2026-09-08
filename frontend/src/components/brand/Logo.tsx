type LogoProps = {
  className?: string;
  alt?: string;
};

export function Logo({ className = "h-8 w-auto", alt = "Пульс" }: LogoProps) {
  return <img src="/brand/logo-white.png" alt={alt} className={className} draggable={false} />;
}
