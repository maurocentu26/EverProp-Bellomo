# -*- coding: utf-8 -*-
with open('src/components/admin/LeadDetailView.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_code = '''      <Dialog open={leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(false)}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="dark:text-slate-100">Eliminar este cliente</DialogTitle>
            <DialogDescription className="dark:text-slate-400">
              ¿Estás seguro de que deseás eliminar este lead? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setLeadToDelete(false)} className="dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteLead}>Eliminar cliente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
'''

lines.insert(len(lines) - 3, new_code)

with open('src/components/admin/LeadDetailView.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)
