import Image from 'next/image';
import { deploymentPath } from './moscollector-core';

export function BrandIdentity() {
  return (
    <span className="brand-identity">
      <Image
        className="brand-logo-image brand-logo-on-light"
        src={deploymentPath('/moscollector-logo-light.png')}
        alt="МосКоллектор — Городская диспетчерская"
        width={735}
        height={148}
        decoding="async"
        unoptimized
      />
      <Image
        className="brand-logo-image brand-logo-on-dark"
        src={deploymentPath('/moscollector-logo-dark.png')}
        alt=""
        aria-hidden="true"
        width={735}
        height={148}
        decoding="async"
        unoptimized
      />
    </span>
  );
}
