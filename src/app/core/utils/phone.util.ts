export interface PhoneCountry {
  code: string;
  name: string;
}

export const SOUTH_AMERICAN_COUNTRIES: readonly PhoneCountry[] = [
  { code: '54', name: 'Argentina' },
  { code: '591', name: 'Bolivia' },
  { code: '55', name: 'Brasil' },
  { code: '56', name: 'Chile' },
  { code: '57', name: 'Colombia' },
  { code: '593', name: 'Ecuador' },
  { code: '592', name: 'Guyana' },
  { code: '595', name: 'Paraguay' },
  { code: '51', name: 'Perú' },
  { code: '597', name: 'Surinam' },
  { code: '598', name: 'Uruguay' },
  { code: '58', name: 'Venezuela' },
];

const COUNTRY_CODES = [...SOUTH_AMERICAN_COUNTRIES].sort((a, b) => b.code.length - a.code.length);

export function splitPhoneNumber(value: string | undefined): { countryCode: string; localNumber: string } {
  let digits = (value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  const country = COUNTRY_CODES.find((item) => digits.startsWith(item.code));
  if (country) {
    return { countryCode: country.code, localNumber: digits.slice(country.code.length) };
  }

  return { countryCode: '591', localNumber: digits };
}

export function formatInternationalPhone(countryCode: string, localNumber: string): string {
  const code = countryCode.replace(/\D/g, '');
  const number = localNumber.replace(/\D/g, '');
  return code && number ? `+${code}${number}` : '';
}

export function whatsappUrl(phone: string | undefined): string | null {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.length === 8) {
    // Compatibility with old local Bolivian numbers.
    digits = `591${digits}`;
  }

  return `https://wa.me/${digits}`;
}
