// Horodatage UTC de l'API affiché en heure locale du navigateur, au format français.
import { DateField, type DateFieldProps } from 'react-admin';

export const Timestamp = (props: DateFieldProps) => (
  <DateField showTime locales="fr-FR" emptyText="—" {...props} />
);
