import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, RatingInput, Textarea, toast } from '../../../components/ui';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useSubmitReview } from '../api';

export function ReviewSheet({ productId, sellerName, open, onClose }: { productId: string; sellerName: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const review = useSubmitReview();
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('review.title', { name: sellerName })}
      description={t('review.subtitle')}
      footer={
        <Button
          block
          disabled={rating === 0}
          loading={review.isPending}
          onClick={() =>
            review.mutate(
              { productId, rating, comment: comment.trim() },
              {
                onSuccess: () => {
                  toast.success(t('review.thanks'));
                  onClose();
                },
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        >
          {t('review.submit')}
        </Button>
      }
    >
      <div className="space-y-4 pt-2">
        <RatingInput value={rating} onChange={setRating} />
        <Textarea label={t('review.comment')} optionalLabel={t('common.optional')} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} />
      </div>
    </BottomSheet>
  );
}
