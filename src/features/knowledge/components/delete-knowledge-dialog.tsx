'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { deleteKnowledgeItemMutation } from '../api/queries';
import { useKnowledgeUiStore } from '../utils/store';

export function DeleteKnowledgeDialog({ businessId }: { businessId: string }) {
  const itemPendingDelete = useKnowledgeUiStore((state) => state.itemPendingDelete);
  const cancelDelete = useKnowledgeUiStore((state) => state.cancelDelete);

  const deleteMutation = useMutation(deleteKnowledgeItemMutation(businessId));

  function handleConfirm() {
    if (!itemPendingDelete) return;
    deleteMutation.mutate(itemPendingDelete.id, {
      onSuccess: (result) => {
        if (result.success) {
          toast.success('Knowledge item deleted.');
          cancelDelete();
        } else {
          toast.error(result.error);
        }
      },
      onError: () => toast.error('Something went wrong. Please try again.')
    });
  }

  return (
    <AlertDialog
      open={itemPendingDelete !== null}
      onOpenChange={(open) => {
        if (!open) cancelDelete();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this knowledge item?</AlertDialogTitle>
          <AlertDialogDescription>
            {itemPendingDelete && (
              <>
                &ldquo;{itemPendingDelete.question}&rdquo; will be permanently removed. Deleting it
                removes that information from future chatbot answers — this can&apos;t be undone.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={deleteMutation.isPending}
            className='bg-destructive text-white hover:bg-destructive/90'
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
