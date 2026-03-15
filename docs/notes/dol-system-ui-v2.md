# D0L System UI V2

## Global Changes

**These are changes which apply to the straight skeleton page also**

1. Page needs to show algorithm title in AppShell header banner: `Procedural Geometry - {algorithmName}`.
2. The timeline-based tools are actually a core educational feature. They need to be improved and made more discoverable:
	1. Moved out of the side panel disclosures, and promoted to a separate, floating element that sits over the canvas when visible
	2. Use an affix in both mobile and desktop responsive layouts, to show/hide the playback controller
	3. Playback frame should be global state, so it is preserved when the state updates. If the number of generations reduces (implicitly or explicitly) clamp to the new max generation.

## D0L Changes

**These are changes which are specific to the D0L page**

1. Need a "Reset View" button like the straight skeleton has.
2. Needs an "Instructions" to explain a brief summary of how a configuration works
3. Needs tooltips for the config to explain each parameter in more detail
4. Generation needs to be pause-able: intermediate configs may result in explosive word growth. Allow user to trigger generation.
5. Safety cap on generation (user configurable): generation stops if the word length exceeds a threshold
6. Numeric inputs validate too aggressively: they should validate (and propagate state) on blur, so the user can fully delete the content without the validation stepping in.
7. Keyword placeholder in Alphabet config is not readable because the input box is too short - should just say "Keywords" and use the tooltip for help
8. No Keyword exists for "move without drawing". Use `f` for this.
9. "Badge" component used to display Alphabet Letters forces capitalize - this is misleading because the Alphabet is case-sensitive. Use a pill instead
10. Composing by typing is OK for some scenarios, but it would be useful to have an intuitive-feeling "drag and drop" composer for production rules as well, where the Alphabet (including keywords) is provided as Pills, and they can be dragged into a combo-box to build up a production rule. The combo-box should parse the Pills down into the actual production rule. This composer should be added as an additional disclosure.
11. The System Config disclosure should be split into separate sections. This would both make the behaviour of the system clearer to understand, and easier to modify as the "settled decisions" could be hidden away:
	1. Alphabet definitions
	2. Raw text production rule editing
	3. Pill-based drag-n-drop editing
	4. Turtle Parameters