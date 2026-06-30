import { CheckCircle, XCircle } from 'lucide-react';

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
  return (
    <div className="border rounded-xl p-4 max-w-xs mt-2 bg-white">
      {available ? (
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-900">{city}</p>
            <p className="text-sm text-gray-600 mt-0.5">
              {fee === 0 ? 'Free delivery' : `LKR ${fee.toLocaleString()}`} &middot; {etaLabel}
            </p>
            {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-900">Not available — {city}</p>
            <p className="text-sm text-gray-600 mt-0.5">{etaLabel}</p>
            {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
