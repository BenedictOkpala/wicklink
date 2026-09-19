import assert from 'node:assert/strict';

// Test scroll-spy calculation logic
const sectionIds = ['overview', 'markets', 'investigations', 'sources', 'system'];

function determineActiveSection({ scrollY, innerHeight, scrollHeight, sectionOffsets }) {
  // Check bottom of document
  if (innerHeight + scrollY >= scrollHeight - 60) {
    return 'system';
  }
  // Check top of document
  if (scrollY < 60) {
    return 'overview';
  }
  const headerThreshold = 140;
  for (const view of sectionIds) {
    const { top, bottom } = sectionOffsets[view];
    // section rect relative to viewport
    const rectTop = top - scrollY;
    const rectBottom = bottom - scrollY;
    if (rectTop <= headerThreshold && rectBottom > headerThreshold) {
      return view;
    }
  }
  return 'overview';
}

const mockSections = {
  overview: { top: 0, bottom: 800 },
  markets: { top: 800, bottom: 2000 },
  investigations: { top: 2000, bottom: 3200 },
  sources: { top: 3200, bottom: 4200 },
  system: { top: 4200, bottom: 4800 },
};

const docHeight = 4800;
const viewportHeight = 800;

// Case 1: At top of page
assert.equal(
  determineActiveSection({
    scrollY: 0,
    innerHeight: viewportHeight,
    scrollHeight: docHeight,
    sectionOffsets: mockSections,
  }),
  'overview'
);

// Case 2: Scrolled into markets
assert.equal(
  determineActiveSection({
    scrollY: 900,
    innerHeight: viewportHeight,
    scrollHeight: docHeight,
    sectionOffsets: mockSections,
  }),
  'markets'
);

// Case 3: Scrolled into investigations
assert.equal(
  determineActiveSection({
    scrollY: 2100,
    innerHeight: viewportHeight,
    scrollHeight: docHeight,
    sectionOffsets: mockSections,
  }),
  'investigations'
);

// Case 4: Scrolled into sources
assert.equal(
  determineActiveSection({
    scrollY: 3300,
    innerHeight: viewportHeight,
    scrollHeight: docHeight,
    sectionOffsets: mockSections,
  }),
  'sources'
);

// Case 5: Scrolled to bottom of document
assert.equal(
  determineActiveSection({
    scrollY: docHeight - viewportHeight,
    innerHeight: viewportHeight,
    scrollHeight: docHeight,
    sectionOffsets: mockSections,
  }),
  'system'
);

console.log('PASS: scroll-spy algorithm handles all section transitions and bottom/top boundaries deterministically.');

