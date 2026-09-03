"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CheckCircle2 } from "lucide-react"

// Definimos qué propiedades necesita recibir este modal para funcionar
type SuccessModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SuccessModal({ isOpen, onOpenChange }: SuccessModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm text-center p-6">
        <DialogHeader className="flex flex-col items-center justify-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          
          <DialogTitle className="text-lg font-semibold text-center">
            ¡Lead agregado con éxito!
          </DialogTitle>
          
          <DialogDescription className="text-center pt-2">
            El prospecto ha sido registrado correctamente en tu pipeline comercial.
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4">
          <Button 
            onClick={() => onOpenChange(false)} 
            className="w-full bg-slate-900 hover:bg-slate-800 text-white"
          >
            Entendido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}