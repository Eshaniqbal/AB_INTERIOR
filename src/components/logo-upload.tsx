'use client';

import { useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Upload } from 'lucide-react';
import { useLogoStore } from '@/lib/store';

export function LogoUpload() {
  const { logo, setLogo } = useLogoStore();

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setLogo(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoDelete = () => {
    setLogo(null);
  };

  return (
    <div className="flex justify-end mb-4">
      {logo ? (
        <div className="relative group">
          <img src={logo} alt="Company Logo" className="h-20 w-auto object-contain" />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
            onClick={handleLogoDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Button 
            type="button" 
            variant="secondary" 
            size="sm" 
            className="flex items-center gap-2"
            onClick={() => document.getElementById('logo-upload')?.click()}
          >
            <Upload className="h-4 w-4" />
            Upload Logo
          </Button>
          <Input
            id="logo-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
        </div>
      )}
    </div>
  );
} 