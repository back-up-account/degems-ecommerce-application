'use client';

import Image from 'next/image';
import { useState } from 'react';

export function ProductGallery({ name, images }: { name: string; images: string[] }) {
  const [selectedImage, setSelectedImage] = useState(0);
  const activeImage = images[selectedImage] ?? images[0];

  if (!activeImage) return null;

  return (
    <div>
      <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <Image
          src={activeImage}
          alt={`${name}, image ${selectedImage + 1}`}
          width={1200}
          height={1000}
          unoptimized
          priority
          className="h-full min-h-[420px] w-full object-cover"
        />
      </div>
      {images.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-3" role="group" aria-label={`${name} product images`}>
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              aria-label={`Show image ${index + 1} of ${name}`}
              aria-pressed={selectedImage === index}
              onClick={() => setSelectedImage(index)}
              className={`overflow-hidden rounded-xl border-2 ${selectedImage === index ? 'border-stone-900' : 'border-transparent'}`}
            >
              <Image
                src={image}
                alt=""
                width={80}
                height={80}
                unoptimized
                className="h-16 w-16 object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
