package com.alphastack.scorereader.keys

import com.alphastack.scorereader.keys.KeyFilter.Decision
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class KeyFilterTest {
  private val pageDown = 93
  private val pageUp = 92
  private val unmapped = 29 // A
  private val back = 4

  private val plan =
      TurnPlan(
          id = 7,
          next = listOf(SlotTarget("main", 3, "SINGLE"), SlotTarget("right", 4, "SINGLE")),
          prev = emptyList(),
      )

  private lateinit var f: KeyFilter

  @Before
  fun setUp() {
    f = KeyFilter()
    f.setMappings(listOf(pageDown, pageUp), listOf("NEXT", "PREV"))
    f.setReaderActive(true)
  }

  private fun down(code: Int, t: Long, repeat: Int = 0) = f.decide(code, true, repeat, t)

  private fun up(code: Int, t: Long) = f.decide(code, false, 0, t)

  @Test
  fun mappedPressFiresAndItsUpIsConsumed() {
    assertEquals(Decision.Action("NEXT", null, 0), down(pageDown, 1000))
    assertEquals(Decision.Consume, up(pageDown, 1050))
  }

  @Test
  fun repeatsAreSwallowed() {
    down(pageDown, 1000)
    assertEquals(Decision.Consume, down(pageDown, 1500, repeat = 1))
    assertEquals(Decision.Consume, down(pageDown, 1550, repeat = 2))
  }

  @Test
  fun pressesInsideDebounceWindowAreSwallowed() {
    f.setDebounceMs(200)
    assertEquals(Decision.Action("NEXT", null, 0), down(pageDown, 1000))
    assertEquals(Decision.Consume, down(pageDown, 1199))
    // The window runs from the last accepted press, not the swallowed bounce.
    assertEquals(Decision.Action("PREV", null, 0), down(pageUp, 1200))
  }

  @Test
  fun unmappedKeysPass() {
    assertEquals(Decision.Pass, down(unmapped, 1000))
    assertEquals(Decision.Pass, up(unmapped, 1010))
  }

  @Test
  fun inactiveReaderPassesMappedKeys() {
    f.setReaderActive(false)
    assertEquals(Decision.Pass, down(pageDown, 1000))
    assertEquals(Decision.Pass, up(pageDown, 1010))
  }

  @Test
  fun learnModeCapturesAnyKeyButLetsBackThrough() {
    f.setReaderActive(false)
    f.setLearning(true)
    assertEquals(Decision.Learned(unmapped), down(unmapped, 1000))
    assertEquals(Decision.Consume, up(unmapped, 1010))
    assertEquals(Decision.Consume, down(unmapped, 1500, repeat = 1))
    assertEquals(Decision.Pass, down(back, 2000))
    assertEquals(Decision.Pass, up(back, 2010))
    f.setLearning(false)
    assertEquals(Decision.Pass, down(unmapped, 3000))
  }

  @Test
  fun planIsSingleUse() {
    f.setPlan(plan)
    assertEquals(Decision.Action("NEXT", plan.next, 7), down(pageDown, 1000))
    assertEquals(Decision.Action("NEXT", null, 0), down(pageDown, 2000))
  }

  @Test
  fun emptyDirectionIsNotAppliedAndSpendsThePlan() {
    f.setPlan(plan)
    assertEquals(Decision.Action("PREV", null, 0), down(pageUp, 1000))
    assertEquals(Decision.Action("NEXT", null, 0), down(pageDown, 2000))
  }

  @Test
  fun leavingTheReaderClearsThePlan() {
    f.setPlan(plan)
    f.setReaderActive(false)
    f.setReaderActive(true)
    val d = down(pageDown, 1000) as Decision.Action
    assertNull(d.targets)
  }
}
