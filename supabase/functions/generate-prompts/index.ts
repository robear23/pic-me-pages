import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log(`[${new Date().toISOString()}] generate-prompts started - Method: ${req.method}`);
  
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { characters, interests, consistentCharacters, targetPageCount = 12, complexityLevel = 'medium', customPrompt = '' } = await req.json();
    
    if (!characters || !Array.isArray(characters) || characters.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: characters array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!interests || !Array.isArray(interests) || interests.length < 1) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: at least 1 interest required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const characterNames = characters.map((c: any) => c.name).join(' and ');
    const hasCharacterPhotos = consistentCharacters && characters.some((c: any) => c.photos && c.photos.length > 0);

    const characterGuidance = hasCharacterPhotos
      ? `\nIMPORTANT - DYNAMIC CHARACTER SCENES: For characters with reference photos, create scenes where the character is:
- In different poses and positions (not repetitive)
- Showing varied facial expressions appropriate to the activity
- Actively engaged with the scene (playing, exploring, creating, discovering)
- At different angles and perspectives
- Naturally interacting with environment and props
Each scene should feel unique and alive - the character should be doing something different in each page.`
      : '';

    // Complexity level guidance
    const complexityLevelMap: Record<string, string> = {
      simple: 'COMPLEXITY: Large shapes, bold outlines, minimal detail suitable for ages 3-5. Keep designs very simple with clear, recognizable forms.',
      medium: 'COMPLEXITY: Balanced detail with moderate complexity for ages 5-6. Include some patterns and details but keep them manageable.',
      detailed: 'COMPLEXITY: Intricate patterns and fine details for ages 7-8 and adults. Include complex textures, backgrounds, and detailed elements.'
    };
    const complexityGuidance = complexityLevelMap[complexityLevel] || complexityLevelMap.medium;

    // Use custom prompt if provided, otherwise use interests
    const contentGuidance = customPrompt.trim()
      ? `Create scenes based on this custom theme/story: ${customPrompt}`
      : `Generate scenes related to these interests: ${interests.join(', ')}. ${interests.length === 1 ? 'Create diverse scenarios all related to this interest.' : 'Distribute scenes evenly across the interests.'}`;

    const systemPrompt = `Generate ${targetPageCount} diverse scene descriptions for ${characterNames}.

COMPOSITION VARIETY (CRITICAL - Mix these shot types):
1. WIDE SHOTS (30% of pages): Character is part of a larger scene
   - Show full environment with character as one element
   - Example: "Sarah exploring a colorful garden full of flowers and butterflies"
   - Character occupies 20-40% of frame
   
2. MEDIUM SHOTS (40% of pages): Character and immediate surroundings
   - Balance between character and environment
   - Example: "Alex building a sandcastle on the beach with seagulls nearby"
   - Character occupies 40-60% of frame
   
3. CLOSE-UP SHOTS (30% of pages): Character-focused with context
   - Character is prominent but environment still visible
   - Example: "Emma reading a book under a big tree"
   - Character occupies 60-80% of frame

ENVIRONMENT EMPHASIS:
- Make backgrounds rich and detailed (trees, buildings, furniture, toys, animals, weather)
- Include multiple colorable elements (flowers, clouds, stars, patterns, objects)
- Create depth with foreground and background elements
- Add contextual items related to the activity

VARIETY REQUIREMENTS:
- Different perspectives: front view, side view, three-quarter view, back view
- Different positions: sitting, standing, lying down, jumping, reaching
- Different distances: far away in scene, part of scene, close to viewer
- Different contexts: indoors, outdoors, nature, urban, imaginative spaces

REQUIREMENTS:
- Natural, child-appropriate scenes
- ${characterNames} doing varied activities
- Clear, straightforward descriptions (2-3 sentences maximum)
- MUST specify shot type and environment detail level
${hasCharacterPhotos ? '- Character appears in different poses, angles, and scene types' : ''}

${complexityGuidance}

${contentGuidance}

Return JSON array with:
{
  "pageNumber": 1-${targetPageCount},
  "interest": "the interest category",
  "shotType": "wide|medium|close",
  "prompt": "Detailed 2-3 sentence scene description with environment details"
}`;

    console.log('Calling Lovable AI for prompt generation...');
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate exactly ${targetPageCount} unique coloring book page prompts.

CRITICAL: Return ONLY valid JSON with proper escaping. Use \\n for newlines in text.

Generate prompts for ${characterNames} using photogenic illustrated style based on: ${interests.join(', ')}` }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Failed to generate prompts' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('No content in AI response:', aiData);
      return new Response(
        JSON.stringify({ error: 'Invalid AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Raw AI response (first 500 chars):', content.substring(0, 500));
    console.log('Content length:', content.length);

    let prompts;
    try {
      let cleanContent = content.trim();
      
      // Remove markdown code blocks
      cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      // Extract JSON structure first
      const extractTopLevelJSON = (s: string): string | null => {
        const scan = (open: string, close: string): string | null => {
          let start = s.indexOf(open);
          if (start === -1) return null;
          let depth = 0;
          let inString = false;
          let escape = false;
          for (let i = start; i < s.length; i++) {
            const ch = s[i];
            if (escape) { escape = false; continue; }
            if (ch === '\\') { escape = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === open) depth++;
            else if (ch === close) {
              depth--;
              if (depth === 0) return s.substring(start, i + 1);
            }
          }
          return null;
        };
        return scan('[', ']') ?? scan('{', '}');
      };

      let candidate = extractTopLevelJSON(cleanContent) ?? cleanContent;
      console.log('Extracted JSON candidate (first 200 chars):', candidate.substring(0, 200));
      
      // Try parsing directly - AI returns valid JSON
      let parsed;
      try {
        parsed = JSON.parse(candidate);
        console.log('Successfully parsed JSON on first attempt');
      } catch (parseError) {
        console.error('JSON parse failed:', parseError);
        console.error('Failed JSON (first 500 chars):', candidate.substring(0, 500));
        throw new Error('Invalid JSON from AI response');
      }
      
      prompts = parsed.prompts || parsed;

      if (!Array.isArray(prompts)) {
        console.error('Parsed result is not an array:', typeof prompts);
        throw new Error('Parsed JSON is not an array');
      }
      
      // Add character names and enforce length limits
      prompts = prompts.map((p: any) => {
        let prompt = p.prompt;
        
        // Enforce 300 character limit
        if (prompt.length > 300) {
          console.warn(`Prompt ${p.pageNumber} too long (${prompt.length} chars), truncating...`);
          prompt = prompt.substring(0, 297) + '...';
        }
        
        return {
          pageNumber: p.pageNumber,
          interest: p.interest,
          prompt: prompt,
          characterName: characterNames
        };
      });
      
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      console.error('Error details:', e instanceof Error ? e.message : 'Unknown error');
      return new Response(
        JSON.stringify({ error: 'Invalid AI response format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!Array.isArray(prompts) || prompts.length !== 12) {
      console.error('Invalid prompts count:', prompts?.length);
      return new Response(
        JSON.stringify({ error: 'Invalid number of prompts generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully generated 12 prompts');
    
    return new Response(
      JSON.stringify({ prompts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-prompts function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
