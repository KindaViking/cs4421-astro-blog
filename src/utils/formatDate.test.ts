import { describe, it, expect } from 'vitest';
import { formatDate } from './formatDate';

describe('formatDate', () => {
	it('formats a standard date correctly', () => {
		const date = new Date(2024, 5, 19); // June 19, 2024
		expect(formatDate(date)).toBe('Jun 19, 2024');
	});

	it('formats a date with a single-digit day', () => {
		const date = new Date(2024, 6, 1); // July 1, 2024
		expect(formatDate(date)).toBe('Jul 1, 2024');
	});
});
