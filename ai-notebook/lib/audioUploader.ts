import { supabase } from "./supabaseClient";

// ✅ Uploads audio to Supabase Storage
export async function uploadAudio(file: File): Promise<string | null> {
    const filePath = `recordings/${Date.now()}-${file.name}`;

    const { data, error } = await supabase.storage
        .from("audio-files")
        .upload(filePath, file, { contentType: file.type });

    if (error) {
        console.error("Upload failed:", error);
        return null;
    }

    return filePath;
}

// ✅ Saves metadata including transcript & summary to the database
export async function saveMetadata(filePath: string, fileName: string, transcript: string, summary: string) {
    const fileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio-files/${filePath}`;

    const { data, error } = await supabase
        .from("audio_recordings")
        .insert([{ file_name: fileName, file_url: fileUrl, transcript, summary }]);

    if (error) {
        console.error("Error saving metadata:", error);
        return null;
    }

    return data;
}

// ✅ Fetches the latest uploaded audio file from the DB
export async function fetchLatestRecording(): Promise<{ file_url: string } | null> {
    const { data, error } = await supabase
        .from("audio_recordings")
        .select("file_url")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    if (error) {
        console.error("Error fetching latest recording:", error);
        return null;
    }

    return data;
}
