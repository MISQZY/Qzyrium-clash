export interface TourBox { left: number; top: number; width: number; height: number }

const MASCOT_ASPECT = 200 / 220

/**
 * Place the mascot in the viewport corner diagonally opposite to the
 * tour card, avoiding the spotlight element.  Falls back to the
 * farthest corner if the preferred one is blocked.
 */
export function placeTourMascot(
  area: TourBox,
  cardBox: TourBox,
  spotlight: TourBox | null,
): TourBox | null {
  const PAD = 16
  // Find the card's center relative to the area
  const cardCx = cardBox.left + cardBox.width / 2
  const cardCy = cardBox.top + cardBox.height / 2
  const areaCx = area.left + area.width / 2
  const areaCy = area.top + area.height / 2

  // Determine the opposite quadrant (card is left → mascot goes right, etc.)
  const goRight = cardCx < areaCx
  const goBottom = cardCy < areaCy

  // Try sizes from large to small
  for (const height of [160, 132, 108, 80]) {
    const width = height * MASCOT_ASPECT

    // Build corner candidates ordered by preference:
    // 1. Diagonally opposite to card
    // 2. Same-row opposite
    // 3. Same-column opposite
    // 4. Same corner (fallback)
    const corners = [
      { right: goRight, bottom: goBottom },   // diagonally opposite (preferred)
      { right: !goRight, bottom: goBottom },   // same column opposite row
      { right: goRight, bottom: !goBottom },   // same row opposite column
      { right: !goRight, bottom: !goBottom },  // same quadrant (worst)
    ]

    for (const corner of corners) {
      const left = corner.right
        ? area.left + area.width - width - PAD
        : area.left + PAD
      const top = corner.bottom
        ? area.top + area.height - height - PAD
        : area.top + PAD

      const box: TourBox = { left, top, width, height }

      // Must not overlap the card (with margin)
      if (overlaps(box, cardBox, 12)) continue
      // Must not overlap the spotlight
      if (spotlight && overlaps(box, spotlight, 8)) continue

      return box
    }
  }
  return null
}

function overlaps(a: TourBox, b: TourBox, margin: number): boolean {
  return (
    a.left < b.left + b.width + margin &&
    a.left + a.width > b.left - margin &&
    a.top < b.top + b.height + margin &&
    a.top + a.height > b.top - margin
  )
}
