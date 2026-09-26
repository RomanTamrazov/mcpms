import Image from 'next/image';

export function BrandIdentity() {
  return (
    <span className="brand-identity">
      <Image
        className="brand-logo-image"
        src="/moscollector-logo-transparent.png"
        alt="МосКоллектор — Городская диспетчерская"
        width={2171}
        height={724}
        priority
      />
    </span>
  );
}
