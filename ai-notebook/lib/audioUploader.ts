import { supabase } from "./supabaseClient";

// ✅ Uploads audio to Supabase Storage
export async function uploadAudio(file: File): Promise<string | null> {
  const filePath = `recordings/${Date.now()}-${file.name}`;

  const { data, error } = await supabase.storage
    .from("media") // Use the 'media' bucket
    .upload(filePath, file, { contentType: file.type });

  if (error) {
    console.error("Upload failed:", error);
    return null;
  }

  return filePath;
}

// ✅ Saves metadata to Supabase tables
export async function saveMetadata(
    filePath: string,
    fileName: string,
    transcript: string,
    summary: string,
    userId: string // Add userId as a parameter
  ) {
    const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${filePath}`;
  
    // Log the data being inserted
    console.log("Inserting into sources:", { title: fileName, type: "audio", processing_status: "completed", user_id: userId });
  
    // Step 1: Insert into the `sources` table
    const { data: sourceData, error: sourceError } = await supabase
      .from("sources")
      .insert([{ title: fileName, type: "audio", processing_status: "completed", user_id: userId }])
      .select()
      .single();
  
    if (sourceError) {
      console.error("Error saving source metadata:", sourceError);
      return null;
    }
  
    const sourceId = sourceData.id;
    console.log("Inserted into sources. Source ID:", sourceId);
  
    // Log the data being inserted
    console.log("Inserting into audio_files:", { source_id: sourceId, file_path: filePath, content_type: "audio/wav" });
  
    // Step 2: Insert into the `audio_files` table
    const { error: audioError } = await supabase
      .from("audio_files")
      .insert([{ source_id: sourceId, file_path: filePath, content_type: "audio/wav" }]);
  
    if (audioError) {
      console.error("Error saving audio file metadata:", audioError);
      return null;
    }
  
    console.log("Inserted into audio_files.");
  
    // Log the data being inserted
    console.log("Inserting into content:", { source_id: sourceId, transcript, summary });
  
    // Step 3: Insert into the `content` table
    const { error: contentError } = await supabase
      .from("content")
      .insert([{ source_id: sourceId, transcript, summary }]);
  
    if (contentError) {
      console.error("Error saving content:", contentError);
      return null;
    }
  
    console.log("Inserted into content.");
  
    return sourceId;
  }

export async function fetchLatestRecordings() {
    try {
      const { data, error } = await supabase
        .from("sources")
        .select(`
          id,
          title,
          type,
          duration,
          created_at,
          audio_files (file_path),
          content (transcript, summary)
        `)
        .order("created_at", { ascending: false }); // Fetch the latest recordings first
  
      if (error) {
        throw error;
      }
  
      // Map the data to a simpler format
      const formattedData = data.map((source) => ({
        id: source.id,
        title: source.title,
        type: source.type,
        duration: source.duration,
        created_at: source.created_at,
        file_url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${source.audio_files[0]?.file_path}`,
        transcript: source.content[0]?.transcript || "", // Access the first element of the content array
        summary: source.content[0]?.summary || "", // Access the first element of the content array
      }));
  
      return formattedData;
    } catch (error) {
      console.error("Error fetching recordings:", error);
      return null;
    }
  }