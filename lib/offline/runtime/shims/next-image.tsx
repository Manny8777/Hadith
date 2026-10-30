// next/image in the offline build: a plain <img>.
import type { ImgHTMLAttributes } from 'react'
type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | { src: string }; priority?: boolean; fill?: boolean; quality?: number; placeholder?: string; unoptimized?: boolean }
export default function Image({ src, priority: _p, fill, quality: _q, placeholder: _ph, unoptimized: _u, style, ...rest }: Props) {
  const s = typeof src === 'string' ? src : src.src
  return <img src={s} style={fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style } : style} {...rest} />
}
