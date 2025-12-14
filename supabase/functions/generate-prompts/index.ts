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
    
    // Validate that either interests OR customPrompt is provided
    const hasInterests = interests && Array.isArray(interests) && interests.length >= 1;
    const hasCustomPrompt = customPrompt && customPrompt.trim().length > 0;
    
    if (!hasInterests && !hasCustomPrompt) {
      return new Response(
        JSON.stringify({ error: 'Invalid input: provide either interests array or a custom prompt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // INTEREST SANITIZATION: ONLY replace truly problematic interests
    // Safe sports like cricket, football, soccer, cycling, jogging are PRESERVED
    // Only IP/trademark and violence-related terms need sanitization
    const INTEREST_SANITIZATION: Record<string, string> = {
      // Fictional/IP - redirect to creative activities (trademark concerns)
      'star wars': 'building a rocket ship from cardboard boxes and exploring space themes',
      'starwars': 'stargazing through a telescope at night',
      'lightsaber': 'playing with glow sticks at a party',
      'jedi': 'meditating in a peaceful zen garden',
      'sith': 'exploring a mysterious forest with mushrooms',
      'darth vader': 'dressing up as a friendly robot costume',
      'marvel': 'creating comic strips with colored pencils',
      'avengers': 'assembling a giant puzzle together',
      'batman': 'reading adventure books in a cozy library',
      'superman': 'wearing a cape and pretending to fly',
      'spiderman': 'climbing on a colorful playground structure',
      'pokemon': 'exploring nature and discovering colorful creatures',
      'fortnite': 'building colorful structures with blocks',
      'minecraft': 'building with colorful blocks and creating structures',
      
      // Violence-related - redirect to safe alternatives
      'hunting': 'going on a treasure hunt with a map',
      'shooting': 'playing carnival ring toss games',
      'gun': 'playing with water balloons in the garden',
      'guns': 'playing with water balloons in the garden',
      'sword': 'having a pretend sword fight with pool noodles',
      'swords': 'playing with pool noodles in the backyard',
      'fight': 'having a pillow fight at a sleepover',
      'fighting': 'having a pillow fight at a sleepover',
      'battle': 'playing an epic board game adventure',
      'war': 'playing an exciting strategy board game',
      'weapon': 'playing with colorful toys',
      'weapons': 'playing with colorful toys',
      'knife': 'doing arts and crafts with safety scissors',
      'boxing': 'practicing fun exercise moves',
      'wrestling': 'playing leapfrog with friends',
      
      // Organizations that could trigger safety filters
      'water witness international': 'exploring nature near a stream and planting flowers',
      'water witness': 'feeding ducks at a peaceful pond',
      'charity': 'helping in a community garden',
      'organization': 'participating in a fun group activity'
    };
    
    // Sanitize interests - ONLY problematic ones, preserve safe sports and activities
    const sanitizeInterest = (interest: string): string => {
      const lowerInterest = interest.toLowerCase().trim();
      
      // Check for exact matches first
      if (INTEREST_SANITIZATION[lowerInterest]) {
        console.log(`⚠️ Interest SANITIZED: "${interest}" → "${INTEREST_SANITIZATION[lowerInterest]}" (IP/violence concern)`);
        return INTEREST_SANITIZATION[lowerInterest];
      }
      
      // Check for partial matches (if the interest contains a risky term)
      for (const [risky, safe] of Object.entries(INTEREST_SANITIZATION)) {
        if (lowerInterest.includes(risky)) {
          console.log(`⚠️ Interest SANITIZED (partial): "${interest}" → "${safe}" (contains "${risky}")`);
          return safe;
        }
      }
      
      // Safe interest - preserve as-is
      console.log(`✅ Interest PRESERVED: "${interest}" (safe for generation)`);
      return interest;
    };
    
    // Provide default empty array for interests if only customPrompt is used
    const rawInterests = hasInterests ? interests : [];
    const effectiveInterests = rawInterests.map(sanitizeInterest);
    
    console.log(`📋 Original interests: ${rawInterests.join(', ')}`);
    console.log(`📋 Sanitized interests: ${effectiveInterests.join(', ')}`);

    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
    if (!GOOGLE_API_KEY) {
      console.error('GOOGLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const characterNames = characters.map((c: any) => c.name).join(' and ');
    const hasCharacterPhotos = consistentCharacters && characters.some((c: any) => c.photos && c.photos.length > 0);

    // SAFE PROMPT GUIDE RULE 1: Never mention age or identity - let reference images define WHO
    const characterGuidance = hasCharacterPhotos
      ? `\nCRITICAL - CHARACTER CONSISTENCY REQUIREMENTS:
- The character's facial features and appearance MUST remain EXACTLY the same across ALL pages
- Reference the provided photo(s) for accurate facial structure, hair style, and physical features
- Keep facial proportions, eye shape, nose, and mouth IDENTICAL to the reference
- Vary ONLY the pose, expression, clothing, and environment - NOT the character's core appearance
- Think: same person in different photos from the same time period
- Dynamic scenes with varied poses and expressions, but IDENTICAL character features`
      : '';
    
    // SAFE PROMPT GUIDE: Words to remove from prompts (Rule 1 - Never mention age/identity)
    const AGE_WORDS = ['child', 'children', 'kid', 'kids', 'young', 'little', 'small', 
                       'boy', 'girl', 'toddler', 'preschooler', 'teenager', 'baby', 'infant',
                       'year-old', 'years old', 'age', 'aged'];
    
    // SAFE PROMPT GUIDE: Words to avoid in prompts (Rule 3 - Use neutral, positive language)
    const RISKY_LANGUAGE = ['dangerous', 'risky', 'extreme', 'intense', 'high', 'steep', 
                            'fast', 'difficult', 'alone', 'unsupervised', 'scary', 'frightening',
                            'challenging', 'unprotected'];
    
    // SAFE PROMPT GUIDE: Positive replacement words
    const POSITIVE_REPLACEMENTS: Record<string, string> = {
      'extreme': 'exciting',
      'dangerous': 'active',
      'difficult': 'fun',
      'scary': 'adventurous',
      'intense': 'active',
      'risky': 'playful',
      'frightening': 'surprising'
    };
    
    // Helper function to sanitize prompts
    const sanitizePromptText = (text: string): string => {
      let result = text;
      // Remove age words
      for (const word of AGE_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        result = result.replace(regex, '');
      }
      // Replace risky language with positive alternatives
      for (const [risky, positive] of Object.entries(POSITIVE_REPLACEMENTS)) {
        const regex = new RegExp(`\\b${risky}\\b`, 'gi');
        result = result.replace(regex, positive);
      }
      // Remove remaining risky words
      for (const word of RISKY_LANGUAGE) {
        if (!POSITIVE_REPLACEMENTS[word]) {
          const regex = new RegExp(`\\b${word}\\b`, 'gi');
          result = result.replace(regex, '');
        }
      }
      return result.replace(/\s+/g, ' ').trim();
    };

    // CRITICAL: Complexity level guidance - this MUST be followed
    const complexityLevelMap: Record<string, string> = {
      simple: `CRITICAL COMPLEXITY REQUIREMENT - SIMPLE LEVEL:
- Use BOLD, THICK outlines (4-6px width)
- Large, basic shapes only - think building blocks
- MINIMAL interior details - NO patterns, textures, or fine lines
- Suitable for ages 3-5 years old
- Think: toddler coloring book with very few elements
- Example: A simple apple with one leaf, no texture or shading areas`,
      
      medium: `CRITICAL COMPLEXITY REQUIREMENT - MEDIUM LEVEL:
- Use MEDIUM outlines (2-4px width)
- Include some patterns and decorative elements
- Moderate detail level suitable for ages 5-6
- Balance simplicity with some interesting elements
- Example: An apple with leaf, stem, and a few background flowers`,
      
      detailed: `CRITICAL COMPLEXITY REQUIREMENT - DETAILED LEVEL:
- Use FINE outlines (1-2px width)
- Include INTRICATE patterns, textures, and many decorative elements
- High level of detail suitable for ages 7+ and adults
- Complex scenes with multiple layers and elements
- Example: An apple with detailed leaf veins, texture patterns, ornate background with flowers and butterflies`
    };
    const complexityGuidance = complexityLevelMap[complexityLevel] || complexityLevelMap.medium;
    
    console.log(`[COMPLEXITY] Using complexity level: ${complexityLevel}`);
    console.log(`[COMPLEXITY] Guidance: ${complexityGuidance}`);

    // SAFE PROMPT GUIDE: Sanitize custom prompt if provided
    const sanitizedCustomPrompt = hasCustomPrompt ? sanitizePromptText(customPrompt) : '';
    
    // Use custom prompt if provided, otherwise use interests
    const contentGuidance = hasCustomPrompt
      ? `Create scenes based on this custom theme/story: ${sanitizedCustomPrompt}`
      : `Generate scenes related to these interests: ${effectiveInterests.join(', ')}. ${effectiveInterests.length === 1 ? 'Create diverse scenarios all related to this interest.' : 'Distribute scenes evenly across the interests.'}`;

    // SAFE PROMPT GUIDE: Activity-first prompt structure (Rule 2)
    // Structure: [Activity] [in Location] [Style] - NOT [Character doing Activity]
    const systemPrompt = `You are creating safe, educational coloring book illustrations. Generate ${targetPageCount} diverse scene descriptions.

CRITICAL PROMPT WRITING RULES (FOLLOW EXACTLY):

1. ACTIVITY-FIRST FORMAT: Describe the activity and environment, NOT the person
   ✅ CORRECT: "Playing soccer in a sunny park with a soccer ball and goal posts"
   ✅ CORRECT: "Riding a bicycle along a tree-lined path with flowers"
   ❌ WRONG: "A young child playing soccer in the park"
   ❌ WRONG: "The 5-year-old riding their bicycle"

2. NEVER USE AGE/IDENTITY WORDS: The reference photo shows who the subject is
   FORBIDDEN WORDS: child, children, kid, kids, young, little, small, boy, girl, 
   toddler, preschooler, teenager, baby, year-old, years old

3. USE POSITIVE LANGUAGE: Replace risky words with encouraging alternatives
   ❌ AVOID: dangerous, risky, extreme, scary, difficult, alone, unsupervised
   ✅ USE: fun, exciting, active, playful, adventurous, learning, practicing

4. ADD SAFETY CONTEXT FOR PHYSICAL ACTIVITIES (naturally, not as focus):
   - "Skateboarding at a skate park with a helmet and knee pads"
   - "Rock climbing with safety equipment on an indoor wall"
   - "Cycling with a helmet along a dedicated path"

5. CREATE AGE-NEUTRAL PROMPTS that work for any reference photo:
   ✅ "Playing guitar in a music room with musical notes floating around"
   ✅ "Gardening in a vegetable garden with tomato plants and flowers"
   ✅ "Painting at an easel with brushes and colorful paint supplies"

${complexityGuidance}

COMPOSITION VARIETY (CRITICAL - Mix these shot types):
1. WIDE SHOTS (30% of pages): Subject is part of a larger scene
   - Show full environment with subject as one element
   - Example: "Exploring a colorful garden full of flowers and butterflies"
   - Subject occupies 20-40% of frame
   
2. MEDIUM SHOTS (40% of pages): Subject and immediate surroundings
   - Balance between subject and environment
   - Example: "Building a sandcastle on the beach with seagulls nearby"
   - Subject occupies 40-60% of frame
   
3. CLOSE-UP SHOTS (30% of pages): Subject-focused with context
   - Subject is prominent but environment still visible
   - Example: "Reading a book under a big tree"
   - Subject occupies 60-80% of frame

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
- Safe, wholesome, child-appropriate scenes
- Activities related to: ${characterNames}
- Clear, straightforward descriptions (2-3 sentences maximum)
- MUST specify shot type and environment detail level
${hasCharacterPhotos ? '- Subject appears in different poses, angles, and scene types' : ''}
- CRITICAL: Follow the complexity guidance above EXACTLY
- CRITICAL: NO age words, NO identity descriptors - activity and environment ONLY

${contentGuidance}

Return JSON array with:
{
  "pageNumber": 1-${targetPageCount},
  "interest": "the interest category",
  "shotType": "wide|medium|close",
  "prompt": "Activity-first scene description with environment details (NO age words)"
}`;

    console.log('Calling Google Gemini API for prompt generation...');
    
    // Combine system prompt and user message for Gemini
    const combinedPrompt = `${systemPrompt}

Generate exactly ${targetPageCount} unique coloring book page prompts.

CRITICAL: Return ONLY valid JSON with proper escaping. Use \\n for newlines in text.

Generate prompts for ${characterNames} using photogenic illustrated style based on: ${hasCustomPrompt ? customPrompt : effectiveInterests.join(', ')}`;

    // FIX #2: Add timeout protection for AI requests
    const AI_TIMEOUT_MS = 60000; // 60 seconds

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI request timed out after 60 seconds')), AI_TIMEOUT_MS);
    });

    const MODEL = 'gemini-2.0-flash-exp';
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    const aiResponsePromise = fetch(`${API_ENDPOINT}?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: combinedPrompt }]
        }],
        generationConfig: {
          temperature: 0.9,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
        }
      }),
    });

    const aiResponse = await Promise.race([aiResponsePromise, timeoutPromise]) as Response;

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('❌ Gemini API error:', {
        status: aiResponse.status,
        statusText: aiResponse.statusText,
        body: errorText,
        headers: Object.fromEntries(aiResponse.headers.entries())
      });
      
      // Return specific error messages with status codes
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded. Please try again in a moment.',
            statusCode: 429
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 403) {
        return new Response(
          JSON.stringify({ 
            error: 'API quota exceeded. Please check your Google API key.',
            statusCode: 403
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status >= 500) {
        return new Response(
          JSON.stringify({ 
            error: 'AI service temporarily unavailable. Please try again.',
            statusCode: aiResponse.status
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: `AI service error: ${aiResponse.statusText}`,
          statusCode: aiResponse.status,
          details: errorText
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    
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
      
      // Sanitize control characters in JSON strings before parsing
      // Replace unescaped control characters (0x00-0x1F) with spaces, except for escaped ones
      const sanitizeJSON = (jsonStr: string): string => {
        let result = '';
        let inString = false;
        let escape = false;
        
        for (let i = 0; i < jsonStr.length; i++) {
          const char = jsonStr[i];
          const code = jsonStr.charCodeAt(i);
          
          if (escape) {
            result += char;
            escape = false;
            continue;
          }
          
          if (char === '\\') {
            escape = true;
            result += char;
            continue;
          }
          
          if (char === '"') {
            inString = !inString;
            result += char;
            continue;
          }
          
          // Replace control characters inside strings
          // JSON strings cannot contain unescaped control characters (0-31)
          if (inString && code >= 0 && code <= 31) {
            // Replace all control characters with spaces (including \n, \r, \t)
            result += ' ';
            console.warn(`Replaced control character (code ${code}) at position ${i}`);
          } else {
            result += char;
          }
        }
        
        return result;
      };
      
      candidate = sanitizeJSON(candidate);
      console.log('Sanitized JSON (first 200 chars):', candidate.substring(0, 200));
      
      // Try parsing the sanitized JSON
      let parsed;
      try {
        parsed = JSON.parse(candidate);
        console.log('Successfully parsed JSON');
      } catch (parseError) {
        console.error('JSON parse failed:', parseError);
        console.error('Failed JSON (first 500 chars):', candidate.substring(0, 500));
        
        // Try more aggressive sanitization as fallback
        console.log('Attempting aggressive sanitization...');
        try {
          // Replace all control characters globally, not just in strings
          const aggressiveSanitized = candidate.replace(/[\x00-\x1F\x7F]/g, ' ');
          console.log('Aggressive sanitized (first 200 chars):', aggressiveSanitized.substring(0, 200));
          parsed = JSON.parse(aggressiveSanitized);
          console.log('Successfully parsed with aggressive sanitization');
        } catch (secondError) {
          console.error('Aggressive sanitization also failed:', secondError);
          throw new Error('Invalid JSON from AI response after multiple sanitization attempts');
        }
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

    if (!Array.isArray(prompts) || prompts.length !== targetPageCount) {
      console.error('Invalid prompts count:', prompts?.length, 'expected:', targetPageCount);
      return new Response(
        JSON.stringify({ error: 'Invalid number of prompts generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully generated ${targetPageCount} prompts`);
    
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
