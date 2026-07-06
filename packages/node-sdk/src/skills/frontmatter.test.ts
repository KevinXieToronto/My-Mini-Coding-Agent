import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from './frontmatter';

describe('parseFrontmatter', () => {
  it('splits header attributes from the body', () => {
    const { attributes, body } = parseFrontmatter(
      '---\nname: add-changeset\ndescription: Record a change.\n---\nStep 1. Do it.\n',
    );
    expect(attributes).toEqual({ name: 'add-changeset', description: 'Record a change.' });
    expect(body).toBe('Step 1. Do it.\n');
  });

  it('treats a file with no frontmatter as all body', () => {
    const { attributes, body } = parseFrontmatter('just instructions');
    expect(attributes).toEqual({});
    expect(body).toBe('just instructions');
  });

  it('strips surrounding quotes from a value', () => {
    expect(parseFrontmatter('---\nname: "quoted"\n---\nx').attributes['name']).toBe('quoted');
  });
});
