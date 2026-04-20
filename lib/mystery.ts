import { MysteryBoxReward } from "@prisma/client";

/**
 * Weighted random selection for Mystery Box rewards.
 */
export function drawMysteryReward(rewards: MysteryBoxReward[]): MysteryBoxReward {
  const totalWeight = rewards.reduce((sum, r) => sum + r.probability, 0);
  let random = Math.random() * totalWeight;

  for (const reward of rewards) {
    if (random < reward.probability) {
      return reward;
    }
    random -= reward.probability;
  }

  return rewards[rewards.length - 1]; // Fallback
}
