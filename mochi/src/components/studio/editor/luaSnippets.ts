// Built-in Lua Game Mechanic Snippets for Mochi Studio

import { Completion, snippetCompletion } from '@codemirror/autocomplete';

export interface MochiSnippet {
  id: string;
  label: string;
  detail: string;
  documentation: string;
  template: string;
  rawCode: string;
}

export const BUILTIN_SNIPPETS: MochiSnippet[] = [
  {
    id: 'hazard_block',
    label: 'hazard_block',
    detail: 'Hazard Killbrick Snippet',
    documentation: 'Damages player health on touch contact and triggers respawn at spawn point.',
    template: `-- Hazard Killbrick: damages player on contact and triggers respawn
local hazard = script.Parent

hazard.Touched:Connect(function(player)
  if player then
    player.damage(\${1:100})
    player.respawn()
  end
end)`,
    rawCode: `-- Hazard Killbrick: damages player on contact and triggers respawn
local hazard = script.Parent

hazard.Touched:Connect(function(player)
  if player then
    player.damage(100)
    player.respawn()
  end
end)`
  },
  {
    id: 'coin_collectible',
    label: 'coin_collectible',
    detail: 'Coin Collectible Snippet',
    documentation: 'Increments player score category, plays spatial audio effect, and destroys node.',
    template: `-- Coin Collectible: increments score, plays pickup sound, and destroys coin
local coin = script.Parent
local collected = false

coin.Touched:Connect(function(player)
  if collected then return end
  collected = true

  player.addScore("\${1:Coins}", \${2:1})
  world.playSound("\${3:coin_pickup}", coin.Position)
  coin:Destroy()
end)`,
    rawCode: `-- Coin Collectible: increments score, plays pickup sound, and destroys coin
local coin = script.Parent
local collected = false

coin.Touched:Connect(function(player)
  if collected then return end
  collected = true

  player.addScore("Coins", 1)
  world.playSound("coin_pickup", coin.Position)
  coin:Destroy()
end)`
  },
  {
    id: 'dialogue_npc',
    label: 'dialogue_npc',
    detail: 'Dialogue NPC Trigger Snippet',
    documentation: 'Prompts interactive visual novel dialogue with choice selection and notifications.',
    template: `-- Dialogue NPC: prompts interactive visual novel dialogue with choices
local npc = script.Parent
local isTalking = false

npc.Touched:Connect(function(player)
  if isTalking then return end
  isTalking = true

  ui.showDialogue({
    speaker = "\${1:Elder Sage}",
    text = "\${2:Greetings traveler! Are you prepared to enter the neon realm?}",
    choices = { "\${3:I was born ready!}", "\${4:I need more training.}" },
    onChoice = function(index, choiceText)
      if index == 1 then
        ui.showNotification("\${5:Quest accepted: Enter the Portal!}", 3.0)
      else
        ui.showNotification("\${6:Return when you are prepared.}", 3.0)
      end
      isTalking = false
    end
  })
end)`,
    rawCode: `-- Dialogue NPC: prompts interactive visual novel dialogue with choices
local npc = script.Parent
local isTalking = false

npc.Touched:Connect(function(player)
  if isTalking then return end
  isTalking = true

  ui.showDialogue({
    speaker = "Elder Sage",
    text = "Greetings traveler! Are you prepared to enter the neon realm?",
    choices = { "I was born ready!", "I need more training." },
    onChoice = function(index, choiceText)
      if index == 1 then
        ui.showNotification("Quest accepted: Enter the Portal!", 3.0)
      else
        ui.showNotification("Return when you are prepared.", 3.0)
      end
      isTalking = false
    end
  })
end)`
  },
  {
    id: 'door_tween',
    label: 'door_tween',
    detail: 'Door Tween Open/Close Snippet',
    documentation: 'Smooth door tween animation with automatic return close using TweenService.',
    template: `-- Door Tween: smooth opening and automatic closing using TweenService
local door = script.Parent
local isOpen = false
local closedPos = door.Position
local openPos = Vector3.new(closedPos.x, closedPos.y + \${1:5}, closedPos.z)
local tweenInfo = TweenInfo.new(\${2:0.8}, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

door.Touched:Connect(function(player)
  if not isOpen then
    isOpen = true

    local openTween = TweenService:Create(door, tweenInfo, { Position = openPos })
    openTween:Play()

    task.delay(\${3:3}, function()
      local closeTween = TweenService:Create(door, tweenInfo, { Position = closedPos })
      closeTween:Play()
      closeTween.Completed:Connect(function()
        isOpen = false
      end)
    end)
  end
end)`,
    rawCode: `-- Door Tween: smooth opening and automatic closing using TweenService
local door = script.Parent
local isOpen = false
local closedPos = door.Position
local openPos = Vector3.new(closedPos.x, closedPos.y + 5, closedPos.z)
local tweenInfo = TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

door.Touched:Connect(function(player)
  if not isOpen then
    isOpen = true

    local openTween = TweenService:Create(door, tweenInfo, { Position = openPos })
    openTween:Play()

    task.delay(3, function()
      local closeTween = TweenService:Create(door, tweenInfo, { Position = closedPos })
      closeTween:Play()
      closeTween.Completed:Connect(function()
        isOpen = false
      end)
    end)
  end
end)`
  }
];

export function getSnippetCompletions(): Completion[] {
  return BUILTIN_SNIPPETS.map((snippet) =>
    snippetCompletion(snippet.template, {
      label: snippet.label,
      detail: snippet.detail,
      info: snippet.documentation,
      type: 'snippet',
      boost: 15
    })
  );
}
