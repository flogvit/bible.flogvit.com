

import { ReactNode } from 'react';
import { AuthProvider } from './AuthContext';
import { SettingsProvider } from './SettingsContext';
import { FavoritesProvider } from './FavoritesContext';
import { ReadingPlanProvider } from './ReadingPlanContext';
import { TopicsProvider } from './TopicsContext';
import { NotesProvider } from './NotesContext';
import { DevotionalsProvider } from './DevotionalsContext';
import { VerseVersionsProvider } from './VerseVersionsContext';
import { ReadingPositionProvider } from './ReadingPositionContext';
import { SyncProvider } from './SyncContext';
import { MappingProvider } from './MappingContext';
import { ServiceWorkerProvider } from './ServiceWorkerProvider';
import { OfflineIndicator } from './OfflineIndicator';
import { UpdateNotification } from './UpdateNotification';
import { CommandPaletteProvider } from './CommandPaletteContext';
import { CommandPalette } from './CommandPalette';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <MappingProvider>
        <FavoritesProvider>
          <TopicsProvider>
            <NotesProvider>
              <DevotionalsProvider>
              <VerseVersionsProvider>
                <ReadingPositionProvider>
                  <ReadingPlanProvider>
                    <SyncProvider>
                      <CommandPaletteProvider>
                        {children}
                        <CommandPalette />
                        <ServiceWorkerProvider />
                        <OfflineIndicator />
                        <UpdateNotification />
                      </CommandPaletteProvider>
                    </SyncProvider>
                  </ReadingPlanProvider>
                </ReadingPositionProvider>
              </VerseVersionsProvider>
              </DevotionalsProvider>
            </NotesProvider>
          </TopicsProvider>
        </FavoritesProvider>
        </MappingProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
