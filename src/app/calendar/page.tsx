import { redirect } from 'next/navigation';

// The previous calendar contained fabricated prototype events. Keep old
// bookmarks safe while directing users to the operational dashboard until a
// verified economic-data provider is integrated.
export default function RetiredCalendarPage() {
  redirect('/operations');
}
