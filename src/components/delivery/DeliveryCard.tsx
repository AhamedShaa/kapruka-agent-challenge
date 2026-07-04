import { Truck, AlertTriangle } from 'lucide-react';
import ResponseCard from '@/components/ui/ResponseCard.js';

interface DeliveryCardProps {
  city: string;
  fee: number;
  available: boolean;
  etaLabel: string;
  note: string;
}

export default function DeliveryCard({
  city,
  fee,
  available,
  etaLabel,
  note,
}: DeliveryCardProps): React.JSX.Element {
  if (!available) {
    return (
      <ResponseCard
        variant="error"
        icon={<AlertTriangle className="w-4 h-4" />}
        title={`No delivery to ${city}`}
        rows={[
          { label: 'Status', value: etaLabel },
          ...(note ? [{ label: 'Note', value: note }] : []),
        ]}
      />
    );
  }

  return (
    <ResponseCard
      icon={<Truck className="w-4 h-4" />}
      title={`Delivery to ${city}`}
      rows={[
        {
          label: 'Fee',
          value: fee === 0 ? 'Free' : `LKR ${fee.toLocaleString()}`,
          valueClass: fee === 0 ? 'text-success-700' : undefined,
        },
        { label: 'Estimated arrival', value: etaLabel },
        ...(note ? [{ label: 'Note', value: note, valueClass: 'text-gray-500 font-normal' }] : []),
      ]}
    />
  );
}
