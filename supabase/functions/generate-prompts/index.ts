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
    const { characters, interests, complexity, artStyle, consistentCharacters } = await req.json();
    
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
    const complexityGuide = {
      simple: 'Use thick, clear lines (4-6px). Minimal background. Large simple shapes. Ages 3-5.',
      medium: 'Balanced detail with moderate line weight (2-3px). Some background elements. Mix of shapes. Ages 5-8.',
      detailed: 'Intricate patterns with fine lines (1-2px). Rich backgrounds. Small details and textures. Ages 8+.'
    };

    const artStyleGuide = {
      cartoon: 'Fun, playful cartoon style with exaggerated features',
      realistic: 'Lifelike proportions and natural details',
      minimalist: 'Clean, simple lines with minimal detail',
      whimsical: 'Magical, imaginative style with creative flourishes',
      photorealistic: 'Ultra-realistic photograph quality. Professional portrait photography style. Photographic accuracy with studio lighting. If character photos provided, maintain exact facial features, expressions, and proportions from reference.'
    };

    const systemPrompt = `You are an expert at creating child-friendly coloring page descriptions. Generate 12 unique, detailed prompts for black & white coloring pages featuring ${characterNames} in scenarios related to their interests: ${interests.join(', ')}.

STYLE REQUIREMENTS:
- Complexity: ${complexity} - ${complexityGuide[complexity as keyof typeof complexityGuide] || complexityGuide.medium}
- Art Style: ${artStyle} - ${artStyleGuide[artStyle as keyof typeof artStyleGuide] || artStyleGuide.cartoon}
- Character Consistency: ${consistentCharacters ? 'CRITICAL - Keep character appearances consistent across ALL pages. Use same clothing, hair, facial features throughout.' : 'Varied appearances are OK'}
- Simple outlines, no shading or gradients
- Black and white line art only
- Child-appropriate content
- Focus on action, setting, and clear character presence

${interests.length === 1 ? 'Create diverse scenarios all related to: ' + interests[0] : 'Distribute scenes evenly across the selected interests.'}

Return a JSON array of exactly 12 prompts, each with:
{
  "pageNumber": 1-12,
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
          { role: 'user', content: `Generate 12 coloring page prompts for ${characterNames} (${complexity} complexity, ${artStyle} style) based on: ${interests.join(', ')}` }
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

    let prompts;
    try {
      let cleanContent = content.trim();
      cleanContent = cleanContent.replace(/```json/g, '').replace(/```/g, '').trim();

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

      const candidate = extractTopLevelJSON(cleanContent) ?? cleanContent;
      const parsed = JSON.parse(candidate);
      prompts = parsed.prompts || parsed;

      if (!Array.isArray(prompts)) {
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
