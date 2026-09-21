import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, it, expect } from 'vitest';
import AuthorBio from '../src/components/AuthorBio.astro';

describe('AuthorBio', () => {
	it('renders avatar with alt text, bio, and social links', async () => {
		const container = await AstroContainer.create();
		const result = await container.renderToString(AuthorBio, {
			props: {
				name: 'Jane Doe',
				avatar: { src: '/jane-doe.jpg', width: 96, height: 96, format: 'jpg' },
				bio: 'Jane writes about distributed systems.',
				socialLinks: [{ platform: 'GitHub', url: 'https://github.com/janedoe' }],
			},
		});

		expect(result).toContain('alt="Photo of Jane Doe"');
		expect(result).toContain('Jane writes about distributed systems.');
		expect(result).toContain('https://github.com/janedoe');
	});

	it('omits the links list when no social links are provided', async () => {
		const container = await AstroContainer.create();
		const result = await container.renderToString(AuthorBio, {
			props: {
				name: 'Jane Doe',
				avatar: { src: '/jane-doe.jpg', width: 96, height: 96, format: 'jpg' },
				bio: 'Bio text',
			},
		});

		expect(result).not.toContain('author-bio__links');
	});
});
