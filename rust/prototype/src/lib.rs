// Prototype ABI: UTF-8 input; output matches JavaScript String.length (UTF-16 units).
#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let bytes = vec![0u8; len].into_boxed_slice();
    Box::into_raw(bytes) as *mut u8
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    unsafe { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len))) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn utf16_len(ptr: *const u8, len: usize) -> i32 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    match std::str::from_utf8(bytes) {
        Ok(text) => i32::try_from(text.encode_utf16().count()).unwrap_or(-1),
        Err(_) => -1,
    }
}
