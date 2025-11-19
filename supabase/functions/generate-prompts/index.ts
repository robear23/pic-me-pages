import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
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

    const systemPrompt = `You are an expert at creating child-friendly coloring page descriptions. Generate ${targetPageCount} unique, detailed prompts for black & white coloring pages featuring ${characterNames}.

STYLE REQUIREMENTS:
- PHOTOREALISTIC PHOTOGRAPHY STYLE - Shot like a professional children's portrait photographer
- Natural, authentic, real-world appearance as if captured with a camera
- CRITICAL: NOT illustrated, NOT cartoon, NOT artistic rendering - must look like real photographs
- Character Consistency: CRITICAL - Keep character identity consistent across ALL pages. Recognize the same character throughout with exact facial features, eye color, hair texture, and skin tone.${characterGuidance}
- Natural poses and expressions as if captured in a real moment
- Final output will be converted to simple black and white line art
- Child-appropriate content
- Focus on action, setting, and clear character presence
- Pleasant composition with clean, uncluttered backgrounds

${complexityGuidance}

CONTENT GUIDANCE:
${contentGuidance}

Return a JSON array of exactly ${targetPageCount} prompts, each with:
{
  "pageNumber": 1-${targetPageCount},
  "interest": "the interest category",
  "prompt": "detailed scene description including character names and style notes"
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
      
      // Try parsing directly first
      let parsed;
      try {
        parsed = JSON.parse(candidate);
      } catch (firstError) {
        console.log('First parse failed, attempting sanitization...');
        
        // If direct parsing fails, try sanitizing control characters
        // This is more careful - only replace actual control chars in string contexts
        candidate = candidate.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match: string) => {
          const code = match.charCodeAt(0);
          // Common control characters that should be escaped
          if (code === 10) return '\\n';  // newline
          if (code === 13) return '\\r';  // carriage return
          if (code === 9) return '\\t';   // tab
          if (code === 8) return '\\b';   // backspace
          if (code === 12) return '\\f';  // form feed
          return '';  // Remove other control chars
        });
        
        console.log('Sanitized candidate (first 200 chars):', candidate.substring(0, 200));
        parsed = JSON.parse(candidate);
      }
      
      prompts = parsed.prompts || parsed;

      if (!Array.isArray(prompts)) {
        console.error('Parsed result is not an array:', typeof prompts);
        throw new Error('Parsed JSON is not an array');
      }
      
      // Add character names to each prompt
      prompts = prompts.map((p: any) => ({
        pageNumber: p.pageNumber,
        interest: p.interest,
        prompt: p.prompt,
        characterName: characterNames
      }));
      
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
